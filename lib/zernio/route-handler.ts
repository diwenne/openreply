import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@/app/generated/prisma/client';
import { MetaApiError } from '@/lib/meta/client';
import { canManageWorkspace, getCurrentWorkspaceContext, type WorkspaceContext } from '@/lib/workspace-access';

export class ConnectionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function withZernioManagement(handler: (context: WorkspaceContext, request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const context = await getCurrentWorkspaceContext();
      if (!context) throw new ConnectionError('Sign in to manage your connection.', 401);
      if (!canManageWorkspace(context.role)) throw new ConnectionError('Only workspace owners and admins can manage the Zernio connection.', 403);
      if (request.method !== 'GET') {
        const origin = request.headers.get('origin');
        // Behind a TLS-terminating proxy request.url is http://, so also accept the public NEXTAUTH_URL origin.
        const allowed = [new URL(request.url).origin];
        if (process.env.NEXTAUTH_URL) allowed.push(new URL(process.env.NEXTAUTH_URL).origin);
        if (origin && !allowed.includes(origin)) throw new ConnectionError('Invalid request origin.', 403);
      }
      return await handler(context, request);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ success: false, error: 'This connection was already added. Refresh and try again.' }, { status: 409 });
      if (error instanceof ConnectionError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
      if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'Unexpected Zernio response. Please retry or contact support.' }, { status: 502 });
      if (error instanceof MetaApiError) {
        const message = error.code === 401 ? 'The Zernio API key is invalid or expired.' : error.code === 403 ? 'Use an unrestricted, read-write Zernio key with access to this profile and Inbox.' : error.code === 402 ? 'This Zernio account needs Inbox access. Check your Zernio plan.' : error.message;
        return NextResponse.json({ success: false, error: message }, { status: 502 });
      }
      return NextResponse.json({ success: false, error: 'Could not configure Zernio. Please retry.' }, { status: 502 });
    }
  };
}

export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ConnectionError('Send a JSON request body.');
  const input: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ConnectionError(parsed.error.issues.map(i => i.message).join('; '));
  return parsed.data;
}
