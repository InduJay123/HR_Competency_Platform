"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "./shell";
import { Card, Feedback } from "./ui";

export function BillingSummary() {
  const session = useSession();
  const chief = !!session.contexts?.includes("manager");
  const [invoice, setInvoice] = useState<{
    invoice_number: string;
    billing_year: number;
    total_amount: string;
    currency: string;
    due_at: string;
    status: string;
    is_overdue: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (chief)
      api<typeof invoice>("billing/current/")
        .then((data) => {
          if (alive) {
            setInvoice(data);
            setLoaded(true);
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [chief, session.company_id]);
  if (!chief) return null;
  return (
    <Card title="Annual billing">
      <Feedback error={error} />
      {invoice ? (
        <>
          <p>
            {invoice.billing_year} · {invoice.invoice_number} ·{" "}
            {invoice.currency} {invoice.total_amount}
          </p>
          <p>
            {invoice.status === "PAID"
              ? "Paid"
              : invoice.status === "PAYMENT_PROOF_SUBMITTED"
                ? "Payment proof submitted. Awaiting Super Admin verification."
                : "Awaiting payment"}
            {invoice.is_overdue && " · Overdue"} · Due {invoice.due_at}
          </p>
        </>
      ) : (
        <p>
          {loaded
            ? "No annual invoice is available for the current billing year."
            : "Loading annual invoice…"}
        </p>
      )}
      <Link className="button neutral" href="/hr/billing">
        View Billing
      </Link>
    </Card>
  );
}
