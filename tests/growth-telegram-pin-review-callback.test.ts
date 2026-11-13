import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findReview: vi.fn(),
  claimReview: vi.fn(),
  updateReview: vi.fn(),
  findUser: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    growthTelegramPinReview: {
      findUnique: mocks.findReview,
      updateMany: mocks.claimReview,
      update: mocks.updateReview,
    },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock("@/lib/growth/publishing/service", () => ({
  approvePinCandidate: mocks.approve,
  rejectPinCandidate: mocks.reject,
  recommendPinApprovalPlan: vi.fn(),
}));

import { acceptPrivatePinCallback } from "@/lib/growth/publishing/telegram-pin-review";

const now = new Date("2026-11-13T12:00:00.000Z");
const config = {
  token: "123456:" + "A".repeat(35),
  privateChatId: "1234567",
  webhookSecret: "S".repeat(48),
};
const event = {
  callback_query: {
    id: "test_callback_id",
    from: { id: 1234567 },
    data: "p:ck12345678901234:s",
    message: { message_id: 3241, chat: { id: 1234567, type: "private" } },
  },
};
const review = {
  id: "ck12345678901234",
  status: "SENT",
  expiresAt: new Date("2026-11-13T14:00:00.000Z"),
  telegramMessageId: 3241,
  ownerUserId: "owner1",
  accountId: "account1",
  boardId: "board1",
  scheduledAt: new Date("2026-11-13T16:00:00.000Z"),
  candidateId: "candidate1",
  candidateRevision: 4,
  contentHash: "a".repeat(64),
  assetChecksum: "b".repeat(64),
  candidate: {
    revision: 4,
    status: "READY",
    contentHash: "a".repeat(64),
    asset: { checksum: "b".repeat(64) },
    destinationPath: "/translators/jester-translator",
  },
};
const fetcher = vi.fn(async () => Response.json({ ok: true, result: {} })) as unknown as typeof fetch;

describe("Private Telegram Pin approval callback side-effect gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findReview.mockResolvedValue(review);
    mocks.findUser.mockResolvedValue({ role: "ADMIN" });
    mocks.claimReview.mockResolvedValue({ count: 1 });
    mocks.updateReview.mockResolvedValue({});
    mocks.approve.mockResolvedValue({ publication: { id: "publication1" } });
    mocks.reject.mockResolvedValue({});
  });

  it("binds exactly one approved Pin to the originally previewed account, board, time and website", async () => {
    const result = await acceptPrivatePinCallback(event, config, fetcher, now);
    expect(result.status).toBe("APPROVED");
    expect(mocks.approve).toHaveBeenCalledTimes(1);
    expect(mocks.approve).toHaveBeenCalledWith({
      candidateId: "candidate1",
      accountId: "account1",
      boardId: "board1",
      scheduledAt: "2026-11-13T16:00:00.000Z",
      confirmation: true,
      destinationDomain: "saytwist.com",
    }, "owner1", now);
    expect(mocks.updateReview).toHaveBeenCalledWith({
      where: { id: review.id },
      data: { status: "APPROVED", actedAt: now,
        destinationDomain: "saytwist.com", publicationId: "publication1" },
    });
  });

  it("does not accept a replay after the atomic claim has been consumed", async () => {
    mocks.claimReview.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await acceptPrivatePinCallback(event, config, fetcher, now)).status).toBe("APPROVED");
    expect((await acceptPrivatePinCallback(event, config, fetcher, now)).status).toBe("IGNORED");
    expect(mocks.approve).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong private sender, group, message ID, expiry, changes to copy/image, and revoked Admin roles", async () => {
    const variants: { update: unknown; current: typeof review; role?: string }[] = [
      { update: { callback_query: { ...event.callback_query, from: { id: 1234500 } } }, current: review },
      { update: { callback_query: { ...event.callback_query, message: {
        message_id: 3241, chat: { id: 1234567, type: "group" },
      } } }, current: review },
      { update: event, current: { ...review, telegramMessageId: 987 } },
      { update: event, current: { ...review, expiresAt: now } },
      { update: event, current: { ...review, candidate: { ...review.candidate, contentHash: "changed" } } },
      { update: event, current: { ...review, candidate: { ...review.candidate, asset: { checksum: "changed" } } } },
      { update: event, current: { ...review, candidate: { ...review.candidate, revision: 5 } } },
      { update: event, current: review, role: "USER" },
    ];
    for (const variant of variants) {
      vi.clearAllMocks();
      mocks.findReview.mockResolvedValue(variant.current);
      mocks.findUser.mockResolvedValue({ role: variant.role || "ADMIN" });
      expect((await acceptPrivatePinCallback(variant.update, config, fetcher, now)).status).toBe("IGNORED");
      expect(mocks.approve).not.toHaveBeenCalled();
      expect(mocks.reject).not.toHaveBeenCalled();
      expect(mocks.claimReview).not.toHaveBeenCalled();
    }
  });

  it("allows rejecting the exact Pin without running publisher or approving", async () => {
    const reject = { callback_query: { ...event.callback_query, data: "p:ck12345678901234:r" } };
    const result = await acceptPrivatePinCallback(reject, config, fetcher, now);
    expect(result.status).toBe("REJECTED");
    expect(mocks.reject).toHaveBeenCalledWith({
      candidateId: "candidate1",
      reason: "Rejected by owner in private Telegram Pin review.",
    }, "owner1", now);
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("permits the other website only for Translator candidates", async () => {
    const legacy = { callback_query: { ...event.callback_query, data: "p:ck12345678901234:l" } };
    expect((await acceptPrivatePinCallback(legacy, config, fetcher, now)).status).toBe("APPROVED");
    expect(mocks.approve).toHaveBeenCalledWith(expect.objectContaining({
      destinationDomain: "translator.whattypeof.com",
    }), "owner1", now);

    vi.clearAllMocks();
    mocks.findReview.mockResolvedValue({ ...review, candidate: {
      ...review.candidate, destinationPath: "/ideas/new-trend",
    } });
    mocks.findUser.mockResolvedValue({ role: "ADMIN" });
    mocks.claimReview.mockResolvedValue({ count: 1 });
    mocks.updateReview.mockResolvedValue({});
    expect((await acceptPrivatePinCallback(legacy, config, fetcher, now)).status).toBe("FAILED");
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
