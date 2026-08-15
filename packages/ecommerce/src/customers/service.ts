// Customer service — customer management, addresses, groups

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createCustomerService() {
  async function list(storeId: string, params: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 25, search } = params;
    const where: Record<string, unknown> = { storeId };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { orders: { take: 5, orderBy: { createdAt: 'desc' } }, addresses: true, groups: { include: { group: true } } },
      }),
      prisma.customer.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async function getById(id: string) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 20 },
        addresses: true,
        groups: { include: { group: true } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!customer) throw new Error('Customer not found');
    return customer;
  }

  async function getByEmail(email: string, storeId: string) {
    return prisma.customer.findUnique({
      where: { storeId_email: { email, storeId } },
      include: { addresses: true, groups: { include: { group: true } } },
    });
  }

  async function create(input: any) {
    return prisma.customer.create({ data: input, include: { addresses: true } });
  }

  async function update(id: string, input: any) {
    return prisma.customer.update({ where: { id }, data: input });
  }

  // Addresses
  async function addAddress(customerId: string, input: any) {
    const address = await prisma.address.create({
      data: { customerId, ...input },
    });
    if (input.isDefault) {
      await prisma.address.updateMany({
        where: { customerId, id: { not: address.id } },
        data: { isDefault: false },
      });
    }
    return address;
  }

  async function updateAddress(addressId: string, input: any) {
    return prisma.address.update({ where: { id: addressId }, data: input });
  }

  async function removeAddress(addressId: string) {
    await prisma.address.delete({ where: { id: addressId } });
  }

  // Groups
  async function assignToGroup(customerId: string, groupId: string) {
    return prisma.customerGroupMember.create({ data: { customerId, groupId } });
  }

  async function removeFromGroup(customerId: string, groupId: string) {
    await prisma.customerGroupMember.delete({
      where: { customerId_groupId: { customerId, groupId } },
    });
  }

  async function listGroups(storeId: string) {
    return prisma.customerGroup.findMany({ where: { storeId } });
  }

  async function createGroup(input: any) {
    return prisma.customerGroup.create({ data: input });
  }

  return { list, getById, getByEmail, create, update, addAddress, updateAddress, removeAddress, assignToGroup, removeFromGroup, listGroups, createGroup };
}