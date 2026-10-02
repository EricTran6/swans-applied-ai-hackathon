// Field lists per Clio resource, copied from scripts/clio_dump.py.
const CF = "custom_field_values{id,field_name,field_type,value,custom_field}";

export const MATTER_F = ["id", "etag", "display_number", "description", "status", "open_date", "close_date",
  "pending_date", "billable", "location", "client_reference", "maildrop_address",
  "created_at", "updated_at", "client_id",
  "client{id,name,type,first_name,last_name}", "contact{id,name}",
  "practice_area{id,name}", "responsible_attorney{id,name}",
  "originating_attorney{id,name}", "responsible_staff{id,name}",
  "matter_stage{id,name}", "statute_of_limitations{id,due_at,status}",
  "group{id,name}", "billing_method", "custom_rate{id}", "account_balances{id}",
  "folder{id,name}", CF];
export const MATTER_LIST_F = ["id", "display_number", "description", "status", "client{id,name}"];
export const CONTACT_F = ["id", "etag", "name", "first_name", "last_name", "middle_name", "prefix", "suffix",
  "title", "type", "date_of_birth", "initials", "primary_email_address",
  "primary_phone_number", "primary_web_site", "company{id,name}", "image_url",
  "avatar", "photo", "image", "email_addresses{id,address,name,default_email}",
  "phone_numbers{id,number,name,default_number}",
  "addresses{id,name,street,city,province,postal_code,country,primary}",
  "web_sites{id,address,name}", "instant_messengers{id,address,name}",
  "created_at", "updated_at", "is_client", "clio_connect_email",
  "currency{id,code}", "notes{id}", CF];
export const REL_F = ["id", "description", "created_at", "updated_at", "contact{id,name,type}",
  "matter{id,display_number}"];
export const NOTE_F = ["id", "etag", "subject", "detail", "detail_text_type", "date", "created_at", "updated_at",
  "creator{id,name}", "regarding{id,type,display_number,name}", "matter{id}", "contact{id}",
  "time_entries{id}", "notes_attachments{id}"];
export const COMM_F = ["id", "etag", "subject", "body", "type", "date", "time", "received_at", "created_at",
  "updated_at", "external_properties{id,name,value}", "senders{id,name,type,email_address}",
  "receivers{id,name,type,email_address}", "matter{id,display_number}",
  "user{id,name}", "has_attachments", "time_entries{id}", "documents{id,name}",
  "conversation_id", "message_type", "attachment_count"];
export const TASK_F = ["id", "etag", "name", "description", "priority", "status", "statute_of_limitations",
  "due_at", "completed_at", "reminders{id}", "assignee{id,name,type}", "assigner{id,name}",
  "matter{id,display_number}", "task_type{id,name}", "created_at", "updated_at", "permission"];
export const CAL_F = ["id", "etag", "summary", "description", "location", "start_at", "end_at", "all_day",
  "recurrence_rule", "calendar_entry_event_type{id,name}", "calendar_owner{id,name}",
  "matter{id,display_number}", "attendees{id,name,type,email}", "created_at", "updated_at",
  "reminders{id}", "external_properties{id}", "permission", "send_email_notification"];
export const EXP_F = ["id", "etag", "type", "date", "quantity", "price", "total", "note", "contingency_fee",
  "billed", "non_billable", "non_billable_total", "activity_description{id,name}",
  "expense_category{id,name}", "user{id,name}", "matter{id,display_number}",
  "vendor{id,name}", "created_at", "updated_at", "reference", "bill{id}"];
export const DOC_F = ["id", "etag", "name", "type", "filename", "content_type", "size", "document_category{id,name}",
  "parent{id,type,name}", "matter{id}", "creator{id,name}", "received_at", "created_at",
  "updated_at", "deleted", "locked",
  "latest_document_version{id,filename,size,content_type,received_at,fully_uploaded,created_at,uuid}"];
export const FOLDER_F = ["id", "name", "type", "parent{id,type}", "matter{id}", "created_at", "updated_at"];

export const f = (list: string[]): string => list.join(",");
