-- C3: Add comms opt-in flags to tours.
-- Both default false so no tour sends to crew without the TM explicitly enabling it.
-- inbound_qa_enabled: allows crew to ask Claude questions via WhatsApp free text.
-- morning_message_enabled: registers the daily morning-message schedule for this tour.

alter table tours add column inbound_qa_enabled boolean not null default false;
alter table tours add column morning_message_enabled boolean not null default false;
