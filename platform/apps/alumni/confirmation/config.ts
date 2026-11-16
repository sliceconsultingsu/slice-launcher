// Settings for confirmation emails. Change a number here, not in the code that uses it.

/** An alum is asked again only after this long since the last email they were sent. */
export const CONFIRM_INTERVAL_DAYS = 365;
/** A send the mail service refused for one alum is tried again only after this long. */
export const RETRY_AFTER_HOURS = 24;
/** Most emails sent by one request. The screen asks again until none are left. */
export const SEND_BATCH_MAX = 10;
/** The name alumni see as the sender. */
export const SENDER_NAME = "Slice Consulting";
