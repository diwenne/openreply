import { expect, it } from 'vitest';
import { zernioLink } from '@/lib/zernio-links';
it('attributes placement while preserving destination query and hash', () => {
  const url = new URL(zernioLink({ path: '/signup?plan=inbox#start', placement: 'settings' }));
  expect(url.origin).toBe('https://zernio.link');
  expect(url.pathname).toBe('/diwen/signup');
  expect(url.hash).toBe('#start');
  expect(Object.fromEntries(url.searchParams)).toEqual({ plan: 'inbox', utm_source: 'openreply', utm_medium: 'sponsorship', utm_campaign: 'openreply-integration', utm_content: 'settings' });
});
it('cannot turn the branded link helper into an external redirect', () => {
  expect(() => zernioLink({ path: '//evil.example', placement: 'test' })).toThrow();
});
