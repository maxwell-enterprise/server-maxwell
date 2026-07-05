/**
 * Mirrors FE `CUSTOM_VIEW_FEATURES` — custom roles store view ids, not IAM resource slugs.
 */
export const CUSTOM_VIEW_RESOURCE_LINKS: ReadonlyArray<{
  viewFeatureId: string;
  resourceId: string;
}> = [
  { viewFeatureId: 'view_crm', resourceId: 'crm_members' },
  { viewFeatureId: 'view_leads', resourceId: 'crm_leads' },
  { viewFeatureId: 'view_paid_conversions', resourceId: 'mkt_paid_conversions' },
  { viewFeatureId: 'view_marketing', resourceId: 'mkt_campaigns' },
  { viewFeatureId: 'view_cms_admin', resourceId: 'cms_content' },
  { viewFeatureId: 'view_communication', resourceId: 'sys_communication' },
  { viewFeatureId: 'view_operations', resourceId: 'ops_event_mgmt' },
  { viewFeatureId: 'view_events_admin', resourceId: 'ops_event_mgmt' },
  { viewFeatureId: 'view_forms_admin', resourceId: 'ops_event_mgmt' },
  { viewFeatureId: 'view_certification_grid', resourceId: 'ops_event_mgmt' },
  { viewFeatureId: 'view_certification_rules', resourceId: 'ops_event_mgmt' },
  { viewFeatureId: 'view_tag_management', resourceId: 'ops_event_mgmt' },
  { viewFeatureId: 'view_contracts', resourceId: 'sys_contracts' },
  { viewFeatureId: 'view_store_admin', resourceId: 'ops_inventory' },
  { viewFeatureId: 'view_finance', resourceId: 'fin_invoices' },
  { viewFeatureId: 'view_commission_config', resourceId: 'fin_invoices' },
  { viewFeatureId: 'view_automation_center', resourceId: 'sys_database' },
  { viewFeatureId: 'view_db_schema', resourceId: 'sys_database' },
  { viewFeatureId: 'view_security', resourceId: 'sys_iam' },
  { viewFeatureId: 'view_ai_usage', resourceId: 'sys_ai_usage' },
  { viewFeatureId: 'view_system_maintenance', resourceId: 'sys_maintenance' },
];

export function customRoleGrantsResource(
  allowedFeatures: readonly string[],
  resourceId: string,
): boolean {
  if (allowedFeatures.includes(resourceId)) {
    return true;
  }
  return CUSTOM_VIEW_RESOURCE_LINKS.some(
    (link) =>
      link.resourceId === resourceId &&
      allowedFeatures.includes(link.viewFeatureId),
  );
}
