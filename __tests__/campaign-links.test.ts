import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "../app/generated/prisma/client";
import {
  buildInitialCampaignLinks,
  syncCampaignLinks,
} from "../lib/campaigns/links";

type Row = {
  id: string;
  workspaceId: string;
  automationId: string;
  slug: string;
  label: string | null;
  destinationUrl: string;
  position: number;
  createdAt: Date;
};

const PRIMARY = "https://example.com/primary";
const SECOND = "https://example.com/second";
const THIRD = "https://example.com/third";
const CREATED = new Date("2026-05-01T00:00:00.000Z");

let rows: Row[];
let ops: string[];
let nextId: number;

// A stand-in for the tracked link table that sorts the way Postgres does for
// TRACKED_LINK_ORDER and records every operation, so a test can check both the
// outcome and when the links were read.
function fakeTx() {
  const pick = (row: Row) => ({ id: row.id, position: row.position });

  return {
    trackedLink: {
      findMany: async ({ where }: { where: { automationId: string } }) => {
        ops.push("read");
        return rows
          .filter((row) => row.automationId === where.automationId)
          .sort(
            (a, b) =>
              a.position - b.position ||
              a.createdAt.getTime() - b.createdAt.getTime() ||
              a.id.localeCompare(b.id)
          )
          .map(pick);
      },
      create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
        ops.push("create");
        const row = { ...data, id: `link_new_${nextId++}`, createdAt: new Date() };
        rows.push(row);
        return pick(row);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Row>;
      }) => {
        ops.push(`update:${Object.keys(data).sort().join(",")}`);
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return pick(row);
      },
      delete: async ({ where }: { where: { id: string } }) => {
        ops.push("delete");
        rows = rows.filter((r) => r.id !== where.id);
      },
    },
  } as unknown as Prisma.TransactionClient;
}

function link(overrides: Partial<Row> & Pick<Row, "id">): Row {
  return {
    workspaceId: "workspace_123",
    automationId: "automation_123",
    slug: `slug_${overrides.id}`,
    label: null,
    destinationUrl: PRIMARY,
    position: 0,
    createdAt: CREATED,
    ...overrides,
  };
}

const primaryLink = () =>
  link({ id: "link_a", label: "Primary campaign link", destinationUrl: PRIMARY, position: 0 });
const secondLink = () =>
  link({ id: "link_b", label: "Read the guide", destinationUrl: SECOND, position: 1 });

// The campaign's links in button order, as every reader now sees them.
function buttons() {
  return rows
    .filter((row) => row.automationId === "automation_123")
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      position: row.position,
      label: row.label,
      destinationUrl: row.destinationUrl,
    }));
}

function save(fields: {
  primaryUrl?: string | null;
  secondaryUrl?: string | null;
  secondaryLabel?: string | null;
}) {
  return syncCampaignLinks(fakeTx(), {
    workspaceId: "workspace_123",
    automationId: "automation_123",
    ...fields,
  });
}

beforeEach(() => {
  rows = [];
  ops = [];
  nextId = 1;
});

describe("syncCampaignLinks", () => {
  it("does not touch the links when the save carries no link fields", async () => {
    rows = [primaryLink(), secondLink()];

    await save({});
    await save({ primaryUrl: null, secondaryUrl: null });

    expect(ops).toEqual([]);
  });

  it("reads the links once, before writing anything", async () => {
    rows = [primaryLink(), secondLink()];

    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(ops[0]).toBe("read");
    expect(ops.filter((op) => op === "read")).toHaveLength(1);
  });

  it("keeps each URL on its own button when a two-link campaign is saved unchanged", async () => {
    rows = [primaryLink(), secondLink()];

    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });
    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(buttons()).toEqual([
      { position: 0, label: "Primary campaign link", destinationUrl: PRIMARY },
      { position: 1, label: "Read the guide", destinationUrl: SECOND },
    ]);
  });

  it("repairs two links an older build saved with the same position", async () => {
    // Before positions existed, both links of a campaign created in one
    // request share a createdAt, and an older build writes position 0 for both.
    rows = [
      link({ id: "link_a", label: "Primary campaign link", destinationUrl: PRIMARY }),
      link({ id: "link_b", label: "Read the guide", destinationUrl: SECOND }),
    ];

    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(buttons()).toEqual([
      { position: 0, label: "Primary campaign link", destinationUrl: PRIMARY },
      { position: 1, label: "Read the guide", destinationUrl: SECOND },
    ]);
  });

  it("does not rewrite positions that are already right", async () => {
    rows = [primaryLink(), secondLink()];

    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(ops).not.toContain("update:position");
  });

  it("changes only the first link when only its URL is sent", async () => {
    rows = [primaryLink(), secondLink()];

    await save({ primaryUrl: "https://example.com/new", secondaryLabel: "Ignored" });

    expect(buttons()).toEqual([
      { position: 0, label: "Primary campaign link", destinationUrl: "https://example.com/new" },
      { position: 1, label: "Read the guide", destinationUrl: SECOND },
    ]);
  });

  it("adds a second link after the first", async () => {
    rows = [primaryLink()];

    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(buttons()).toEqual([
      { position: 0, label: "Primary campaign link", destinationUrl: PRIMARY },
      { position: 1, label: "Read the guide", destinationUrl: SECOND },
    ]);
  });

  it("creates both links in button order on a campaign that had none", async () => {
    await save({ primaryUrl: PRIMARY, secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(buttons()).toEqual([
      { position: 0, label: "Primary campaign link", destinationUrl: PRIMARY },
      { position: 1, label: "Read the guide", destinationUrl: SECOND },
    ]);
  });

  it("moves the second link up when the first is removed, without duplicating it", async () => {
    rows = [primaryLink(), secondLink()];

    await save({ primaryUrl: "", secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(buttons()).toEqual([
      { position: 0, label: "Read the guide", destinationUrl: SECOND },
    ]);
  });

  it("removes the second link and keeps the first", async () => {
    rows = [primaryLink(), secondLink()];

    await save({ primaryUrl: PRIMARY, secondaryUrl: "" });

    expect(buttons()).toEqual([
      { position: 0, label: "Primary campaign link", destinationUrl: PRIMARY },
    ]);
  });

  it("keeps a third link behind the two it manages", async () => {
    rows = [
      primaryLink(),
      secondLink(),
      link({ id: "link_c", label: "Third", destinationUrl: THIRD, position: 2 }),
    ];

    await save({ primaryUrl: "", secondaryUrl: SECOND, secondaryLabel: "Read the guide" });

    expect(buttons()).toEqual([
      { position: 0, label: "Read the guide", destinationUrl: SECOND },
      { position: 1, label: "Third", destinationUrl: THIRD },
    ]);
  });

  it("uses the default title for a second button left blank", async () => {
    rows = [primaryLink()];

    await save({ secondaryUrl: SECOND, secondaryLabel: "   " });

    expect(buttons()[1]).toEqual({ position: 1, label: "Open link", destinationUrl: SECOND });
  });

  it("leaves other campaigns' links alone", async () => {
    const other = link({ id: "link_other", automationId: "automation_other", position: 5 });
    rows = [primaryLink(), secondLink(), other];

    await save({ primaryUrl: "", secondaryUrl: "" });

    expect(rows).toEqual([other]);
  });
});

describe("buildInitialCampaignLinks", () => {
  it("numbers the links in button order", () => {
    const links = buildInitialCampaignLinks({
      workspaceId: "workspace_123",
      primaryUrl: PRIMARY,
      secondaryUrl: SECOND,
      secondaryLabel: "Read the guide",
    });

    expect(links).toMatchObject([
      { position: 0, label: "Primary campaign link", destinationUrl: PRIMARY },
      { position: 1, label: "Read the guide", destinationUrl: SECOND },
    ]);
    expect(links[0].slug).not.toBe(links[1].slug);
  });

  it("puts a second link that has no first link at position 0", () => {
    expect(
      buildInitialCampaignLinks({
        workspaceId: "workspace_123",
        primaryUrl: "",
        secondaryUrl: SECOND,
        secondaryLabel: null,
      })
    ).toMatchObject([{ position: 0, label: "Open link", destinationUrl: SECOND }]);
  });

  it("creates nothing without URLs", () => {
    expect(
      buildInitialCampaignLinks({ workspaceId: "workspace_123", primaryUrl: null })
    ).toEqual([]);
  });
});
