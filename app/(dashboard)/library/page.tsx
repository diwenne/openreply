"use client";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { useRouter } from "next/navigation";

type Asset = { id: string; kind: string; name: string; version: number; data: Record<string, unknown> };
type Account = { id: string; username: string };
type Campaign = { id: string; name: string; trackedLinks?: { destinationUrl: string; label: string | null }[]; [key: string]: unknown };
const box = "rounded border border-border bg-surface p-3 w-full";
export default function LibraryPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [account, setAccount] = useState("");
  const [keyword, setKeyword] = useState("LINK");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("Hey {username}, here is your resource: {link}");
  const [category, setCategory] = useState("CREATOR");
  const [templateSource, setTemplateSource] = useState("");
  const [editing, setEditing] = useState<Asset | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const results = await Promise.all([fetch("/api/library"), fetch("/api/instagram/accounts"), fetch("/api/automations")]);
    if (results.some(r => !r.ok)) throw new Error(t("Unable to load the library."));
    const [library, accountData, campaignData] = await Promise.all(results.map(r => r.json()));
    setAssets(library.assets); setCanManage(library.canManage);
    setAccounts(accountData.data.instagramAccounts); setCampaigns(campaignData.data);
    setAccount(current => current || accountData.data.instagramAccounts[0]?.id || "");
  }, [t]);
  useEffect(() => { void Promise.resolve().then(load).catch(e => setNotice(e.message)); }, [load]);
  async function post(input: unknown) {
    const response = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error ?? t("Save failed")); return data;
  }
  async function saveResource() {
    setBusy(true); setNotice("");
    try {
      await post({ action: "save", kind: "RESOURCE", name, id: editing?.id, version: editing?.version,
        data: { description, destinationUrl: url, dmMessage: message, category } });
      setEditing(null); await load(); setNotice(t("Resource saved. Existing campaigns and delivered links remain unchanged."));
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  async function saveTemplate() {
    const campaign = campaigns.find(c => c.id === templateSource); if (!campaign) return;
    setBusy(true);
    try {
      await post({ action: "save", kind: "TEMPLATE", name: campaign.name,
        data: { ...campaign, trackedDestinationUrl: campaign.trackedLinks?.[0]?.destinationUrl,
          secondaryDestinationUrl: campaign.trackedLinks?.[1]?.destinationUrl, secondaryButtonLabel: campaign.trackedLinks?.[1]?.label } });
      await load(); setNotice(t("Template saved as an independent content snapshot."));
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  }
  async function create(asset: Asset) {
    setBusy(true);
    const draftFingerprint = JSON.stringify([asset.id, asset.version, account, asset.kind === "RESOURCE" ? keyword : null]);
    const idempotencyKey = draftKeys[draftFingerprint] ?? crypto.randomUUID();
    setDraftKeys(current => ({ ...current, [draftFingerprint]: idempotencyKey }));
    try {
      const data = await post({ action: "create_draft", id: asset.id, instagramAccountId: account, keyword, idempotencyKey });
      router.push(`/campaigns/${data.campaignId}/edit`);
    } catch (e) { setNotice((e as Error).message); setBusy(false); }
  }
  function edit(asset: Asset) {
    setEditing(asset); setName(asset.name); setUrl(String(asset.data.destinationUrl ?? ""));
    setDescription(String(asset.data.description ?? "")); setMessage(String(asset.data.dmMessage ?? ""));
    setCategory(String(asset.data.category ?? "CREATOR"));
  }
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">{t("Templates & resources")}</h1><p className="text-muted mt-2">{t("Reuse content across videos. Every new campaign starts as a draft, without sending.")}</p></header>
    {notice && <p role="status" className={box}>{notice}</p>}
    {canManage && <section className="grid gap-5 md:grid-cols-2">
      <div className="space-y-3 rounded border border-border p-4"><h2 className="font-semibold">{editing ? t("Edit resource · v{version}", { version: editing.version }) : t("New resource")}</h2>
        <label className="block">Name<input className={box} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block">{t("Destination URL")}<input className={box} type="url" value={url} onChange={e => setUrl(e.target.value)} /></label>
        <label className="block">{t("Description")}<textarea className={box} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <label className="block">{t("DM message")}<textarea className={box} value={message} onChange={e => setMessage(e.target.value)} /></label>
        <label className="block">{t("Category")}<select className={box} value={category} onChange={e => setCategory(e.target.value)}><option value="CREATOR">{t("Creator content")}</option><option value="COMPANY">{t("Company content")}</option><option value="CLIENT">{t("Client project")}</option></select></label>
        <button disabled={busy || !name || !url} onClick={saveResource} className="rounded bg-accent px-4 py-2 text-white disabled:opacity-50">{t("Save resource")}</button>
        {editing && <button onClick={() => setEditing(null)} className="ml-3">{t("Cancel")}</button>}
      </div>
      <div className="space-y-3 rounded border border-border p-4"><h2 className="font-semibold">{t("Template from campaign")}</h2>
        <p className="text-sm text-muted">{t("Copy messages, keywords and buttons, without post bindings, status, IDs or statistics.")}</p>
        <select aria-label={t("Template source")} className={box} value={templateSource} onChange={e => setTemplateSource(e.target.value)}><option value="">{t("Choose a campaign")}</option>{campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button disabled={busy || !templateSource} onClick={saveTemplate} className="rounded border border-border px-4 py-2 disabled:opacity-50">{t("Save as template")}</button>
        <h2 className="pt-4 font-semibold">{t("Prepare a new draft")}</h2>
        <label className="block">{t("Instagram account")}<select className={box} value={account} onChange={e => setAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}</select></label>
        <label className="block">{t("Resource keyword")}<input className={box} value={keyword} onChange={e => setKeyword(e.target.value)} /></label>
        <p className="text-sm text-muted">{t("Resources use this keyword; templates retain their saved keywords. Choose the video in the editor.")}</p>
      </div>
    </section>}
    <section className="grid gap-4 md:grid-cols-2">{assets.map(asset => <article key={asset.id} className="space-y-3 rounded border border-border p-4">
      <p className="text-xs text-muted">{asset.kind === "TEMPLATE" ? t("Template") : t("Resource")} · Version {asset.version}</p><h2 className="font-semibold">{asset.name}</h2>
      <p className="text-sm whitespace-pre-wrap">{String(asset.data.description ?? asset.data.dmMessage ?? "")}</p>
      {asset.kind === "RESOURCE" && <a className="text-accent break-all" href={String(asset.data.destinationUrl)} target="_blank" rel="noopener noreferrer">{String(asset.data.destinationUrl)}</a>}
      {canManage && <div className="flex gap-4"><button disabled={busy || !account} onClick={() => create(asset)} className="text-accent disabled:opacity-50">{t("Create draft")}</button>{asset.kind === "RESOURCE" && <button onClick={() => edit(asset)}>{t("Edit")}</button>}</div>}
    </article>)}</section>
    {!assets.length && <p className="text-muted">{t("No templates or resources saved yet.")}</p>}
  </div>;
}
