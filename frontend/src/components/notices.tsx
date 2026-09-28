"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import type { Notice, Page } from "@/lib/types";
import { Button, Card, Feedback } from "./ui";
export function Notices() {
  const [data, setData] = useState<Page<Notice> | null>(null),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api<Page<Notice>>("notifications/")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <>
      <h1>Notifications</h1>
      <p className="subtitle">Your next steps in one place.</p>
      <Feedback error={error} />
      <Card>
        {data?.results.length ? (
          data.results.map((n) => (
            <div className="toolbar" key={n.id}>
              <div>
                <Link href={n.path}>{n.title}</Link>
                <small> · {new Date(n.created_at).toLocaleDateString()}</small>
              </div>
              {!n.read_at && (
                <Button
                  variant="neutral"
                  onClick={async () => {
                    try {
                      await post(`notifications/${n.id}/read/`, {});
                      load();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Mark read
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="empty">No notifications yet.</p>
        )}
      </Card>
    </>
  );
}
