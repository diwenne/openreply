"use client";

'use client';

import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { zernioLink } from '@/lib/zernio-links';

type ConnectionData = {
  configured: boolean; profileId?: string | null; webhookReady?: boolean;
  profiles: { id: string; name: string }[];
  accounts: { id: string; username: string; instagramId: string; connected?: boolean }[];
};

export function ZernioConnection({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<ConnectionData | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [profileId, setProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const response = await fetch('/api/zernio/settings', { cache: 'no-store' });
    const result = await response.json();
    if (!result.success) throw new Error(result.error);
    setData(result.data);
    setProfileId(result.data.profileId ?? '');
  }, []);
  useEffect(() => {
    if (canManage) {
      void fetch('/api/zernio/settings', { cache: 'no-store' }).then(r => r.json()).then(result => {
        if (!result.success) throw new Error(result.error);
        setData(result.data); setProfileId(result.data.profileId ?? '');
      }).catch(e => setError(e instanceof Error ? e.message : "Could not load connection."));
    }
  }, [canManage, refresh]);

  async function act({ path = 'settings', method, body }: { path?: string; method: string; body?: unknown }) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/zernio/${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setApiKey('');
      if (result.data?.authUrl) { window.location.assign(result.data.authUrl); return; }
      if (path === 'accounts') { window.location.reload(); return; }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("Could not update connection.")); }
    finally { setBusy(false); }
  }

  return (
    <section className="zernio-sponsor rounded-xl border p-5 sm:p-6" aria-labelledby="zernio-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 id="zernio-heading" className="text-base font-semibold">{t("Easier Instagram setup")}</h2><p className="mt-1 text-sm">{t("Optional connection provider")}</p></div>
        <a href={zernioLink({ placement: 'settings-logo' })} target="_blank" rel="noopener noreferrer" aria-label={t("Zernio, OpenReply sponsor")}><Image src="/brand/zernio-primary.svg" alt="Zernio" width={106} height={32} className="h-auto" /></a>
      </div>
      <p className="mt-4 text-sm leading-6">{t("Connect Instagram without creating your own Meta developer app. Zernio is a paid service and an OpenReply sponsor. Your campaigns and hosting stay in OpenReply.")}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm"><a className="underline underline-offset-4" href={zernioLink({ path: '/signup', placement: 'settings-signup' })} target="_blank" rel="noopener noreferrer">{t("Get a Zernio API key")}</a><a className="underline underline-offset-4" href={zernioLink({ path: '/pricing', placement: 'settings-pricing' })} target="_blank" rel="noopener noreferrer">{t("View pricing")}</a></p>
      {!canManage ? <p className="mt-4 text-sm">{t("Ask your workspace owner or admin to configure Zernio.")}</p> : <>
        {error && <p role="alert" className="mt-4 rounded border border-error/30 bg-white p-3 text-sm text-error">{error === "Could not load connection." ? t("Could not load connection.") : error}</p>}
        {!data?.configured ? <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void act({ method: 'POST', body: { apiKey } }); }}>
          <label className="block text-sm font-medium" htmlFor="zernio-api-key">{t("Zernio API key")}</label>
          <input id="zernio-api-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} required className="w-full rounded-lg border border-zernio-border bg-white px-3 py-2 text-sm" />
          <p className="text-xs leading-5">{t("Use an unrestricted, read-write key with Inbox access. OpenReply registers a webhook for this workspace. The key is encrypted and never shown again.")}</p>
          <button disabled={busy || !apiKey} className="zernio-action rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-50">{busy ? t("Saving…") : t("Save API key")}</button>
        </form> : <div className="mt-5 space-y-4">
          <p className="text-sm">{t("API key saved securely.")}</p>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act({ method: 'PUT', body: { profileId } }); }}>
            <label htmlFor="zernio-profile" className="block text-sm font-medium">{t("Zernio profile")}</label>
            <select id="zernio-profile" value={profileId} onChange={e => setProfileId(e.target.value)} required className="w-full rounded-lg border border-zernio-border bg-white px-3 py-2 text-sm"><option value="">{t("Select a profile")}</option>{data.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {!data.profiles.length && <p className="text-sm">{t("Create a profile in Zernio, then refresh this page.")}</p>}
            <button disabled={busy || !profileId} className="zernio-action rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-50">{busy ? t("Configuring…") : data.webhookReady && profileId === data.profileId ? t("Repair webhook connection") : t("Save profile and configure webhook")}</button>
          </form>
          {data.webhookReady && <div className="space-y-3 border-t border-zernio-border pt-4">
            <p className="text-sm">{t("Webhook configured. Choose an Instagram account for OpenReply:")}</p>
            {data.accounts.map(a => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>@{a.username}</span><button disabled={busy || a.connected} onClick={() => void act({ path: 'accounts', method: 'POST', body: { accountId: a.id } })} className="rounded-lg border border-zernio-border bg-white px-3 py-2 disabled:opacity-50">{a.connected ? t("Connected") : t("Use in OpenReply")}</button></div>)}
            <button disabled={busy} onClick={() => void act({ path: 'connect', method: 'POST' })} className="rounded-lg border border-zernio-border bg-white px-3 py-2 text-sm disabled:opacity-50">{t("Connect another Instagram account")}</button>
            <p className="text-xs leading-5">{t("After connecting Instagram, return here and select it for OpenReply. Keep Zernio automations off for these campaigns to avoid sending twice.")}</p>
          </div>}
          <button disabled={busy} onClick={() => { if (confirm(t("Remove the Zernio key and this OpenReply webhook? Disconnect its Instagram accounts from OpenReply first."))) void act({ method: 'DELETE' }); }} className="text-xs underline underline-offset-4 disabled:opacity-50">{t("Remove Zernio connection")}</button>
        </div>}
      </>}
    </section>
  );
}
