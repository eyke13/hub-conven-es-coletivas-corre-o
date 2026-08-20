import { createFileRoute } from "@tanstack/react-router";
import { CctHub } from "@/components/cct-hub/CctHub";

export const Route = createFileRoute("/")({
  component: CctHub,
});