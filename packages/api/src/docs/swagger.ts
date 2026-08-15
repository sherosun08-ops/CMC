// Auto-generated Swagger/OpenAPI documentation

import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

const apiDocumentation = {
  openapi: '3.0.3',
  info: {
    title: 'Unified CMC API',
    description: 'Combined Content, Media & Commerce API — unified from Directus, Payload, Strapi, Medusa, Saleor, and Bagisto',
    version: '1.0.0',
    contact: {
      name: 'CMC Team',
      url: 'https://github.com/unified-cmc',
    },
  },
  servers: [
    { url: '/api', description: 'API Server' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'object' },
              status: { type: 'integer' },
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          avatarUrl: { type: 'string' },
          locale: { type: 'string' },
          role: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ContentItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          contentTypeId: { type: 'string' },
          data: { type: 'object' },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          locale: { type: 'string' },
          slug: { type: 'string' },
          publishedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          sku: { type: 'string' },
          status: { type: 'string' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderNumber: { type: 'string' },
          status: { type: 'string' },
          grandTotal: { type: 'number' },
          currency: { type: 'string' },
          items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      OrderItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          quantity: { type: 'integer' },
          unitPrice: { type: 'number' },
          totalPrice: { type: 'number' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email & password',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Login successful' } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new user',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'User created' } },
      },
    },
    '/auth/oauth/{provider}': {
      get: {
        tags: ['Auth'],
        summary: 'OAuth login redirect',
        parameters: [
          { name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['google', 'github', 'apple'] } },
        ],
        responses: { '302': { description: 'Redirect to OAuth provider' } },
      },
    },
    '/cms/content-types': {
      get: {
        tags: ['CMS'],
        summary: 'List all content types',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'List of content types' } },
      },
      post: {
        tags: ['CMS'],
        summary: 'Create content type',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Content type created' } },
      },
    },
    '/cms/content-types/{id}/items': {
      get: {
        tags: ['CMS'],
        summary: 'List content items',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
          { name: 'filter', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Paginated content items' } },
      },
      post: {
        tags: ['CMS'],
        summary: 'Create content item',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Content item created' } },
      },
    },
    '/ecommerce/products': {
      get: {
        tags: ['E-Commerce'],
        summary: 'List products',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 25 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated products' } },
      },
      post: {
        tags: ['E-Commerce'],
        summary: 'Create product',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'Product created' } },
      },
    },
    '/ecommerce/orders': {
      get: {
        tags: ['E-Commerce'],
        summary: 'List orders',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Paginated orders' } },
      },
      post: {
        tags: ['E-Commerce'],
        summary: 'Create order',
        responses: { '201': { description: 'Order created' } },
      },
    },
    '/media/files': {
      get: {
        tags: ['Media'],
        summary: 'List media files',
        parameters: [
          { name: 'folderId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'List of media files' } },
      },
      post: {
        tags: ['Media'],
        summary: 'Upload file',
        security: [{ BearerAuth: [] }],
        responses: { '201': { description: 'File uploaded' } },
      },
    },
  },
};

export const apiDocsRouter = Router();

apiDocsRouter.use('/', swaggerUi.serve, swaggerUi.setup(apiDocumentation, {
  customSiteTitle: 'CMC API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
  },
}));

apiDocsRouter.get('/openapi.json', (_req, res) => {
  res.json(apiDocumentation);
});