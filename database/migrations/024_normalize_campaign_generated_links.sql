-- Normalize existing campaign smart links to explicit store-target format.
-- Old links like `?product=...&source=...` still work in FE,
-- but this migration keeps persisted values aligned with the new generator.

UPDATE campaigns
SET "generatedLink" =
  '/?view=store'
  || CASE
       WHEN "targetProductId" IS NOT NULL AND "targetProductId" <> ''
         THEN '&product=' || "targetProductId"
       ELSE ''
     END
  || '&source=' || "sourceCode"
  || CASE
       WHEN "linkedDiscountCode" IS NOT NULL AND "linkedDiscountCode" <> ''
         THEN '&discount=' || "linkedDiscountCode"
       ELSE ''
     END;
