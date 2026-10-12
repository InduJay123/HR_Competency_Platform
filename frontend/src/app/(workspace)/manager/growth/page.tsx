import { TeamGrowth } from "@/components/growth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;
  return <TeamGrowth key={subject || "team"} initialSubject={subject} />;
}
