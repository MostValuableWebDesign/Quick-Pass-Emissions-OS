export function DealerVirRecoveryNotice({ dealershipId }: { dealershipId: string }) {
  return (
    <div className="notice" role="status">
      <strong>These reports may already be saved.</strong>
      <p>
        Deleted a draft? Its inspections remain saved and its services are available to invoice
        again. You do not need to upload the PDFs again. Open the dealership, select the unbilled
        services, and create a new invoice draft.
      </p>
      <a className="button button-outline" href={`/dealerships/${dealershipId}#create-invoice`}>
        Invoice saved services
      </a>
      <p>Services attached to another invoice cannot be billed again.</p>
    </div>
  );
}
