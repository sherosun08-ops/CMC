// Payment service — multi-gateway support

import { PrismaClient } from '@prisma/client';
import { eventBus } from '@cmc/core';

const prisma = new PrismaClient();

export interface PaymentGateway {
  name: string;
  createPaymentIntent(amount: number, currency: string, metadata?: any): Promise<{ id: string; clientSecret?: string }>;
  capturePayment(intentId: string): Promise<boolean>;
  refundPayment(intentId: string, amount?: number): Promise<boolean>;
  processWebhook(payload: any): Promise<void>;
}

const gateways: Map<string, PaymentGateway> = new Map();

export function registerPaymentGateway(name: string, gateway: PaymentGateway) {
  gateways.set(name, gateway);
}

export function createPaymentService() {
  async function createPayment(input: { orderId: string; storeId: string; provider: string; amount: number; currencyCode: string; metadata?: any }) {
    const gateway = gateways.get(input.provider);
    let gatewayIntent;
    if (gateway) {
      gatewayIntent = await gateway.createPaymentIntent(input.amount, input.currencyCode, input.metadata);
    }

    const payment = await prisma.payment.create({
      data: {
        orderId: input.orderId,
        storeId: input.storeId,
        provider: input.provider,
        amount: input.amount,
        currencyCode: input.currencyCode,
        status: 'AWAITING',
        intentId: gatewayIntent?.id,
        metadata: {
          clientSecret: gatewayIntent?.clientSecret,
          ...input.metadata,
        },
      },
    });

    await eventBus.emit('payment.created', { id: payment.id, orderId: input.orderId });
    return payment;
  }

  async function capturePayment(paymentId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found');

    const gateway = gateways.get(payment.provider);
    if (gateway && payment.intentId) {
      await gateway.capturePayment(payment.intentId);
    }

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'PAID' },
    });

    await prisma.order.update({
      where: { id: payment.orderId! },
      data: { paymentStatus: 'PAID', status: 'PROCESSING' },
    });

    await eventBus.emit('payment.completed', { id: paymentId, orderId: payment.orderId });
    return updated;
  }

  async function refundPayment(paymentId: string, amount?: number) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Payment not found');

    const gateway = gateways.get(payment.provider);
    if (gateway && payment.intentId) {
      await gateway.refundPayment(payment.intentId, amount);
    }

    const refundAmount = amount || payment.amount;
    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });

    // Update order refund total
    await prisma.order.update({
      where: { id: payment.orderId! },
      data: {
        refundedTotal: { increment: refundAmount },
        paymentStatus: 'REFUNDED',
        status: 'REFUNDED',
      },
    });

    await eventBus.emit('payment.refunded', { id: paymentId, orderId: payment.orderId, amount: refundAmount });
    return updated;
  }

  async function handleWebhook(provider: string, payload: any) {
    const gateway = gateways.get(provider);
    if (gateway) {
      await gateway.processWebhook(payload);
    }
  }

  async function getPaymentByIntentId(intentId: string) {
    return prisma.payment.findFirst({ where: { intentId } });
  }

  return { createPayment, capturePayment, refundPayment, handleWebhook, getPaymentByIntentId };
}