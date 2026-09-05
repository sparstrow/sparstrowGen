"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MachineProfileView } from "@sparstrow/views";

export default function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const machineParam = searchParams.get("machine") || searchParams.get("id");

  return (
    <MachineProfileView
      className="h-full"
      selectedMachineId={machineParam}
      onSelectMachine={(id) => {
        router.replace(`/machines?machine=${id}`);
      }}
    />
  );
}
