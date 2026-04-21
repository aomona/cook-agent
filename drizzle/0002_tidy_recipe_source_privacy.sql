UPDATE "recipe_sources"
SET "raw_content" = ("raw_content" - 'extractedText') - 'url'
WHERE "raw_content" ? 'extractedText'
	OR "raw_content" ? 'url';
