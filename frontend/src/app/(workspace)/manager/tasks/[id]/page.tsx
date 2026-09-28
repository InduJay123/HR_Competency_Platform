import { WorkDetail } from "@/components/work";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkDetail id={id} />;
}
