import type { Metadata } from "next";
import "./globals.css";
import "./reviews.css";
import "./responsive.css";
import "./profile-trainer.css";
import "./platform.css";
import "./workspace-motion.css";
import "./steward-refinement.css";
import "./purpose-journey.css";
import { WorkspaceMotion } from "@/components/workspace-motion";
export const metadata: Metadata = {
  title: "Beyond the Finish Line",
  description: "Work, evidence and human-led development.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WorkspaceMotion>{children}</WorkspaceMotion>
      </body>
    </html>
  );
}
