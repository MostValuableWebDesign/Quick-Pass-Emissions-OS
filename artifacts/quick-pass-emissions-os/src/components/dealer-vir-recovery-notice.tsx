export function DealerVirRecoveryNotice({ dealershipId }: { dealershipId: string }) {
  return (
    <div className="notice" role="status">
      <strong>These reports may already be saved.</strong>
      <p>
        Verify the VIN, then choose Update saved test. To create a new invoice from an unbilled
        service, also select Reuse saved service below. The existing inspection is reused, never
        imported or charged twice.
      </p>
      <a
        className="button button-outline"
        href={`/dealerships/${dealershipId}?section=services#create-invoice`}
      >
        Open saved services
      </a>
      <p>
        If a draft was deleted, its saved unbilled services can be reused to create a new invoice.
        Services attached to a sent invoice cannot be billed again.
      </p>
    </div>
  );
}
