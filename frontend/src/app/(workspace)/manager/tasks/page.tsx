import { WorkList } from "@/components/work";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const initialStatus =
    status &&
    ["ASSIGNED", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"].includes(status)
      ? status
      : "";
  return <WorkList key={initialStatus} team initialStatus={initialStatus} />;
}
