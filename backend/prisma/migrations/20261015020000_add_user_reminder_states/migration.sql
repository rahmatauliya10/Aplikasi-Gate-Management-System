-- CreateTable
CREATE TABLE IF NOT EXISTS "user_reminder_states" (
    "user_id" TEXT NOT NULL,
    "snoozed_reminders" JSONB NOT NULL DEFAULT '{}',
    "read_reminders" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reminder_states_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_reminder_states_user_id_fkey'
    ) THEN
        ALTER TABLE "user_reminder_states"
        ADD CONSTRAINT "user_reminder_states_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
