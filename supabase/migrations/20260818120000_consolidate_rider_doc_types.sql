-- Consolidate rider document types per REE-292 and REE-295:
-- tech_rider + staging_rider → production_rider
-- lighting_rider → lx_rider
-- hospitality_rider unchanged

-- Migrate existing documents to new doc_type values
update documents
set doc_type = 'production_rider'
where doc_type in ('tech_rider', 'staging_rider');

update documents
set doc_type = 'lx_rider'
where doc_type = 'lighting_rider';
