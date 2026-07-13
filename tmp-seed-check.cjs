process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/kan_sheets_bi?schema=public";
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const userCount = await prisma.user.count();
  const dsCount = await prisma.dataSource.count();
  const dashCount = await prisma.dashboard.count();
  const widgetCount = await prisma.widget.count();
  console.log({ userCount, dsCount, dashCount, widgetCount });
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
