/**
 * Opening-DM reminder — Unit Tests
 *
 * Someone gets an opening DM with a confirm button; if they haven't tapped it
 * within the delay, one reminder goes out. Covers: reminds when overdue and
 * unconfirmed, skips when already confirmed (a reveal: row exists), skips
 * when not old enough yet, never sends twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockSendDirectMessageWithButton, mockDecryptToken } =
  vi.hoisted(() => ({
    mockPrisma: {
      dmLog: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
    mockSendDirectMessageWithButton: vi.fn(),
    mockDecryptToken: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/meta/client", () => ({
  sendDirectMessageWithButton: mockSendDirectMessageWithButton,
  MetaApiError: class MetaApiError extends Error {
    code: number;
    constructor(code: number, _s: unknown, _t: unknown, message: string) {
      super(message);
      this.code = code;
      this.name = "MetaApiError";
    }
  },
}));
vi.mock("@/lib/meta/oauth", () => ({ decryptToken: mockDecryptToken }));

import { sendPendingOpeningDmReminders } from "../lib/reminders/opening-dm-reminder";

const baseAutomation = {
  id: "auto_1",
  isActive: true,
  openingDmEnabled: true,
  openingDmMessage: "Hey there!",
  openingDmButtonLabel: "Oui, je le souhaite",
  socialAccount: { externalId: "ig_456", accessToken: "encrypted_token" },
};

function pendingRow(overrides = {}) {
  return {
    id: "dmlog_1",
    commenterId: "user_1",
    commenterName: "user_one",
    automation: baseAutomation,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDecryptToken.mockReturnValue("decrypted_token");
  mockSendDirectMessageWithButton.mockResolvedValue({
    recipient_id: "user_1",
    message_id: "msg_1",
  });
  mockPrisma.dmLog.update.mockResolvedValue({});
});

describe("sendPendingOpeningDmReminders", () => {
  it("sends a reminder for an overdue, unconfirmed opening DM", async () => {
    mockPrisma.dmLog.findMany.mockResolvedValue([pendingRow()]);
    mockPrisma.dmLog.findFirst.mockResolvedValue(null); // no reveal: row -> not confirmed

    await sendPendingOpeningDmReminders();

    expect(mockSendDirectMessageWithButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "user_1",
      "Hey there!",
      "Oui, je le souhaite",
      "reveal:auto_1"
    );
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith({
      where: { id: "dmlog_1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("skips (and marks done) when the person already confirmed", async () => {
    mockPrisma.dmLog.findMany.mockResolvedValue([pendingRow()]);
    mockPrisma.dmLog.findFirst.mockResolvedValue({ id: "dmlog_reveal" }); // a reveal: row exists

    await sendPendingOpeningDmReminders();

    expect(mockSendDirectMessageWithButton).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith({
      where: { id: "dmlog_1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("skips a row whose automation no longer has an opening DM configured", async () => {
    mockPrisma.dmLog.findMany.mockResolvedValue([
      pendingRow({ automation: { ...baseAutomation, openingDmEnabled: false } }),
    ]);

    await sendPendingOpeningDmReminders();

    expect(mockSendDirectMessageWithButton).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith({
      where: { id: "dmlog_1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it("only queries rows past the delay with no reminder sent yet", async () => {
    mockPrisma.dmLog.findMany.mockResolvedValue([]);

    await sendPendingOpeningDmReminders();

    expect(mockPrisma.dmLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          openingDmSentAt: { not: null, lte: expect.any(Date) },
          reminderSentAt: null,
        },
      })
    );
  });

  it("marks the row done even when the send fails, so it is never retried in a loop", async () => {
    mockPrisma.dmLog.findMany.mockResolvedValue([pendingRow()]);
    mockPrisma.dmLog.findFirst.mockResolvedValue(null);
    mockSendDirectMessageWithButton.mockRejectedValue(new Error("boom"));

    await sendPendingOpeningDmReminders();

    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith({
      where: { id: "dmlog_1" },
      data: { reminderSentAt: expect.any(Date) },
    });
  });
});
