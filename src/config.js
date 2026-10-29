// Public identifiers only. Nothing here is a secret: the site is public.
export const CONFIG = {
  TENANT_ID: 'd59ce9e8-b410-44cb-894e-9e65dfe021f4',          // clarke-lane.co.uk
  CLIENT_ID: '5b796cc6-c5c9-4500-a84c-07e7952c421f',          // Entra app "Clarke Lane Job Board"
  SUPABASE_URL: 'https://rdvkkftgjyrmraotcrfz.supabase.co',
  SUPABASE_KEY: 'sb_publishable_3EuZ_lKqgulfFMIPbiaskA_lmsi6LYO',
  GRAPH: 'https://graph.microsoft.com/v1.0',
  SP_SITE: 'clarkelane.sharepoint.com:/sites/FactoryJobs',   // Levi's quote calculator lists
  QUOTE_CALCULATOR: 'https://clarkelane.sharepoint.com/sites/FactoryJobs/SitePages/Quoting-Calculator.aspx',   // the Power App itself (29 Oct), opened in a new tab
  // Company Data: customers' old files, laser drawings and material certificates. Read only, never written.
  SP_DATA_SITE: 'clarkelane.sharepoint.com:/sites/CompanyData',
  SP_CLIENTS: 'Company Data/01 Client Folder',
  SP_LASER: 'Bystronic Drawings/Customers',
  SP_CERTS: 'Company Data/Mat Certs',
  SP_MISC: 'MISCELLANEOUS',   // the client folder for one-off customers (quotes named after the customer)
  // Delegated, admin-consented on the Entra app. Do not add scopes here without consent:
  // an unconsented scope stops everyone signing in.
  GRAPH_SCOPES: ['User.Read', 'Sites.ReadWrite.All'],
  // Asked for only when someone emails a document (never at sign-in), so a missing consent
  // cannot stop anyone signing in. Admin-consented on the Entra app.
  MAIL_SCOPES: ['Mail.ReadWrite'],
  // Reading info@ (enquiries) and colleagues' mail on a customer page. Asked for only there, never at sign-in.
  SHARED_MAIL_SCOPES: ['Mail.Read.Shared'],
};
