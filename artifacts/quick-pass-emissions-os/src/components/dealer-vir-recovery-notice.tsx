export function DealerVirRecoveryNotice({ dealershipId }: { dealershipId: string }) {
  return (
    <div className="notice" role="status">
      <strong>These reports may already be saved.</strong>
      <p>
        Re-uploading a saved report is allowed to add a missing VIN. Verify or enter the VIN, then
        select “Update this saved test with the VIN above.” No inspection or charge will be added
        again.
      </p>
      <a className="button button-outline" href={`/dealerships/${dealershipId}#create-invoice`}>
        Open saved services
      </a>
      <p>
        If a draft was deleted, select its saved unbilled service here to create a new invoice.
        Services attached to a sent invoice cannot be billed again.
      </p>
    </div>
  );
}
