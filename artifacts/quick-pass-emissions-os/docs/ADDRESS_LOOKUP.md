# Shared contact addresses

Employees, dealerships and vendors use the same autocomplete-enabled **Street address** field and structured
street, apartment/suite/unit, city, state and ZIP fields. Type at least three characters;
suggestions appear after a 350 ms pause. Use Up/Down then Enter, or select with a pointer.
Escape dismisses suggestions. Typing changes the street field immediately; selecting a suggestion fills the structured fields.
Manual fields and Save remain available throughout lookup failures.

Existing repository integrations, dependencies and configured credential names were inspected;
no address provider was present. The adapter uses [Geoapify Address Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/),
which returns structured components and [permits storing results](https://www.geoapify.com/products-and-services/).
US building addresses with a house number, street, city, state and postal code are suggested.
Incomplete matches are omitted; manual entry also supports addresses outside this lookup scope.

## Setup

Create a Geoapify project and set **GEOAPIFY_API_KEY** in server secrets for each environment.
Do not put it in a NEXT_PUBLIC variable or source control. Choose a plan appropriate for
business usage and monitor its quota. Attribution to Geoapify and OpenStreetMap appears beside
search; see the [provider terms](https://www.geoapify.com/terms-and-conditions/).
No key is included or account provisioned by this change. Missing credentials, throttling,
network/provider failures and no matches all leave manual entry available.

Street text typed into the address field is sent to the provider for suggestions. Apartment/suite,
city, state and ZIP fields are not separately transmitted. Existing addresses are not looked up
just by opening a form; saved data changes only after Save. The authenticated same-origin POST endpoint keeps the key on
the server, requests at most five suggestions, has a five-second deadline and allows at most
30 lookups per management account per minute using a persistent atomic counter shared across
processes. Responses are no-store. Queries, upstream errors and credentials are not logged by
this integration. Owners and managers must have current active access.

## Source labels and saved state

- **Provider selected · Geoapify street address** means the street/locality was selected from
  a returned suggestion. It is **not** postal/delivery validation. Apartment/suite details are
  explicitly identified as manually entered, even when preserved from search text.
- **Manually entered · Address not validated** covers legacy records, manual entries and
  changed street/locality fields. No client-supplied `validated` flag is accepted.

The server signs returned base-address components with the existing authentication secret.
Saves verify that signature against the submitted street, city, state and ZIP before recording
provider provenance; forged or edited selections save as manual. Unit changes preserve the
selected street's provenance, without claiming validation of that unit. Existing apartment,
suite and unit fields survive selection; when empty, a unit suffix such as `Apt 4C`, `Suite 2`
or `#12` in the search text is retained. Review before saving.

All structured fields, source and provider ID persist in PostgreSQL. The additive migration
`202610120004_contact_address_lookup` leaves existing addresses intact and labels them manual;
it adds structured vendor addresses. Codes, login permissions, vendor contact verification and
approved invoice snapshots are preserved. Vendor addresses can be edited with **Save vendor
address** without falsely confirming the primary business contact. Version checks reject stale
vendor/dealership edits. Builds do not migrate or reset business data; normal startup applies
committed migrations. Keep the persistent database and authentication secret stable.

Run `E2E_ADDRESSES_ONLY=1 npm run test:e2e` for all three isolated create/edit/reopen workflows.
Default browser verification includes these three checks. Browser suggestions are synthetic,
privately signed with the isolated server's secret; no production test flag or fake provider
endpoint is added. Unit/route tests exercise the real adapter with controlled upstream responses.
Actual provider credentials and live lookup remain separate verification.
