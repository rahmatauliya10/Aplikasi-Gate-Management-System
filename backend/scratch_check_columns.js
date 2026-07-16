const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking columns in the 'User' table...");
  const columns = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'User' AND table_schema = 'public';
  `;
  
  const columnNames = columns.map(c => c.column_name);
  console.log("Found columns:", columnNames);
  
  const targetColumns = ["phone", "department", "site", "area", "avatarUrl"];
  const existingTargets = targetColumns.filter(col => columnNames.includes(col));
  
  console.log("\n=========================================");
  console.log("DIAGNOSTIC RESULT:");
  console.log("=========================================");
  if (existingTargets.length === 0) {
    console.log("The columns do NOT exist in the database yet.");
    console.log("It seems the migration failed before making changes.");
    console.log("\nACTION REQUIRED: Run the following command to mark the migration as rolled back:");
    console.log("docker compose run --rm backend npx prisma migrate resolve --rolled-back \"20260715150000_add_user_profile_fields\"");
  } else if (existingTargets.length === targetColumns.length) {
    console.log("ALL new columns already exist in the database!");
    console.log("It seems the migration was already applied but not marked as success in the migrations table.");
    console.log("\nACTION REQUIRED: Run the following command to mark the migration as applied:");
    console.log("docker compose run --rm backend npx prisma migrate resolve --applied \"20260715150000_add_user_profile_fields\"");
  } else {
    console.log("PARTIAL columns exist:", existingTargets);
    console.log("The migration was partially applied. You might need to manually drop these columns before retrying:");
    for (const col of existingTargets) {
      console.log(`ALTER TABLE "User" DROP COLUMN "${col}";`);
    }
    console.log("\nAfter dropping, run the --rolled-back command to reset the state:");
    console.log("docker compose run --rm backend npx prisma migrate resolve --rolled-back \"20260715150000_add_user_profile_fields\"");
  }
  console.log("=========================================");
}

main()
  .catch(e => console.error("Error executing query:", e))
  .finally(() => prisma.$disconnect());
