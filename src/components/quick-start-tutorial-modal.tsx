"use client";

import QuickSetupTour, { openQuickSetupTour } from "./quick-setup-tour";

export function openQuickStartTutorial() {
  openQuickSetupTour();
}

interface QuickStartTutorialModalProps {
  businessId: string;
  businessName: string;
  videoUrl?: string; // Kept for backwards compatibility
}

export default function QuickStartTutorialModal(props: QuickStartTutorialModalProps) {
  return <QuickSetupTour businessId={props.businessId} businessName={props.businessName} />;
}