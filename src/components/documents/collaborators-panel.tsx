"use client";

import { Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Collaborator } from "@/types/document";

type CollaboratorsPanelProps = {
  collaborators: Collaborator[];
};

export function CollaboratorsPanel({ collaborators }: CollaboratorsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Collaborators
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {collaborators.map((collaborator) => (
          <div key={collaborator.id} className="flex items-center gap-3">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: collaborator.color }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{collaborator.name}</p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-300">{collaborator.email}</p>
            </div>
          </div>
        ))}
        {collaborators.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-300">No other members have access.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
