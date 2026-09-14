/**
 * Opening-DM reminder (Plume 14/09).
 *
 * Someone comments a trigger keyword, gets an opening DM with a confirm
 * button ("Oui, je le souhaite"). Most tap it right away; some never do. This
 * sweep finds people who got the opening DM and, one hour later, still
 * haven't tapped — and nudges them once with the same message+button.
 *
 * "Confirmed" isn't its own column: a tap fires processPostback, which
 * writes (upserts) a DmLog row keyed by the synthetic commentId
 * `reveal:<userId>` (see lib/queue/dm-worker.ts). So "still waiting" =
 * openingDmSentAt is old enough, reminderSentAt is empty, and no such
 * `reveal:` row exists yet for that commenter under that automation.
 *
 * Runs on an interval in the worker process (same reasoning as
 * lib/polling/comment-reconciler.ts: Vercel's free crons only fire once a
 * day, this needs to check every few minutes).
 */
import { prisma } from "@/lib/db/client";
import { sendDirectMessageWithButton, MetaApiError } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { renderMessageWithTracking } from "@/lib/tracking/message";

const REMINDER_DELAY_MS = 60 * 60 * 1000; // 1h (Plume 14/09) — un seul rappel, pas de relance en cascade

function errMessage(error: unknown): string {
  if (error instanceof MetaApiError) return `Meta ${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function sendPendingOpeningDmReminders(): Promise<void> {
  const cutoff = new Date(Date.now() - REMINDER_DELAY_MS);

  const pending = await prisma.dmLog.findMany({
    where: { openingDmSentAt: { not: null, lte: cutoff }, reminderSentAt: null },
    include: {
      automation: { include: { socialAccount: true } },
    },
    take: 200, // borne dure par passage — la même prudence que le poll des commentaires (jamais un balayage sans fin)
  });

  for (const log of pending) {
    const { automation } = log;

    // Le déclencheur a pu changer depuis (désactivé, bouton retiré) — on ne
    // relance jamais sur une config qui n'existe plus telle quelle, et on
    // marque quand même reminderSentAt pour ne pas rescanner cette ligne
    // indéfiniment à chaque passage.
    if (
      !automation.isActive ||
      !automation.openingDmEnabled ||
      !automation.openingDmMessage ||
      !automation.openingDmButtonLabel
    ) {
      await prisma.dmLog.update({
        where: { id: log.id },
        data: { reminderSentAt: new Date() },
      });
      continue;
    }

    const confirmed = await prisma.dmLog.findFirst({
      where: {
        automationId: automation.id,
        commenterId: log.commenterId,
        commentId: `reveal:${log.commenterId}`,
      },
      select: { id: true },
    });
    if (confirmed) {
      await prisma.dmLog.update({
        where: { id: log.id },
        data: { reminderSentAt: new Date() },
      });
      continue;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(automation.socialAccount.accessToken);
    } catch {
      await prisma.dmLog.update({
        where: { id: log.id },
        data: { reminderSentAt: new Date() },
      });
      continue;
    }

    try {
      const openingText = renderMessageWithTracking({
        message: automation.openingDmMessage,
        commenterName: log.commenterName,
        trackedLinks: [],
      });
      // Même mécanisme que la révélation après un tap (processPostback) :
      // message direct à l'utilisateur, pas une 2e Private Reply sur le même
      // commentaire (Meta n'en autorise qu'une par commentaire — doc
      // officielle Messenger Platform, confirmé 13/09).
      await sendDirectMessageWithButton(
        accessToken,
        automation.socialAccount.externalId,
        log.commenterId,
        openingText,
        automation.openingDmButtonLabel,
        `reveal:${automation.id}`
      );
    } catch (error) {
      console.error(
        `[Reminder] échec pour ${log.commenterId} (automation ${automation.id}) : ${errMessage(error)}`
      );
      // Échoué ou pas, une seule tentative de rappel — jamais de boucle de
      // relance serrée sur un envoi qui casse systématiquement.
    }

    await prisma.dmLog.update({
      where: { id: log.id },
      data: { reminderSentAt: new Date() },
    });
  }
}
