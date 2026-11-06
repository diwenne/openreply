import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_TEMPLATES,
  getCampaignTemplate,
  getCampaignTemplateSlugs,
} from "../lib/templates/campaign-templates";

describe("campaign templates", () => {
  it("ships the public launch template set", () => {
    expect(getCampaignTemplateSlugs()).toEqual([
      "dtc-product-link",
      "real-estate-lead-form",
      "fitness-plan",
      "course-webinar",
      "beauty-price-list",
      "restaurant-menu",
      "event-rsvp",
      "creator-media-kit",
    ]);
  });

  it("defines complete clone data for every template", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      expect(template.title).toBeTruthy();
      expect(template.goal).toBeTruthy();
      expect(template.keywords.length).toBeGreaterThanOrEqual(3);
      expect(template.dmMessage).toContain("{username}");
      expect(template.playbook.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("finds templates by slug and returns null for unknown slugs", () => {
    expect(getCampaignTemplate("dtc-product-link")?.title).toBe(
      "DTC Product Link Drop"
    );
    expect(getCampaignTemplate("missing-template")).toBeNull();
    expect(getCampaignTemplate(undefined)).toBeNull();
  });
});
