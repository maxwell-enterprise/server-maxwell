-- Seed FE-compatible campaigns for Marketing & Growth page.
-- Safe to run repeatedly because inserts are upserted by id.

INSERT INTO campaigns (
  id, name, "sourceCode", category, "targetProductId",
  "linkedDiscountCode", "generatedLink", "createdAt",
  clicks, conversions, revenue
)
VALUES
  (
    'CMP-001',
    'Instagram Launch',
    'ig_launch_25',
    'SOCIAL_MEDIA',
    'PKG-2025-FULL',
    'WELCOME20',
    '?product=PKG-2025-FULL&source=ig_launch_25&discount=WELCOME20',
    '2025-01-01T00:00:00.000Z',
    1250,
    45,
    1080000000
  ),
  (
    'CMP-002',
    'Seminar Jakarta Booth',
    'booth_jkt_01',
    'OFFLINE_EVENT',
    'PROD-SINGLE-A6',
    NULL,
    '?product=PROD-SINGLE-A6&source=booth_jkt_01',
    '2025-02-15T00:00:00.000Z',
    300,
    2,
    5000000
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  "sourceCode" = EXCLUDED."sourceCode",
  category = EXCLUDED.category,
  "targetProductId" = EXCLUDED."targetProductId",
  "linkedDiscountCode" = EXCLUDED."linkedDiscountCode",
  "generatedLink" = EXCLUDED."generatedLink",
  "createdAt" = EXCLUDED."createdAt",
  clicks = EXCLUDED.clicks,
  conversions = EXCLUDED.conversions,
  revenue = EXCLUDED.revenue;
