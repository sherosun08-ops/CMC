// GraphQL proxy route for the admin panel
// In production, this would proxy to the API server

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  try {
    const response = await fetch(`${API_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { errors: [{ message: 'Failed to connect to GraphQL API' }] },
      { status: 500 }
    );
  }
}