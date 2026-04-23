export interface MCPServerConfig {
  name: string;
  domain: string;
  description: string;
  baseUrl: string;
  enabled: boolean;
}

export const MCP_SERVERS: MCPServerConfig[] = [
  {
    name: "HCM.PersonalInformation.Mcp",
    domain: "HCM",
    description: "Employee personal information",
    baseUrl:
      "https://paycorhcmpersonalinformationmcpncQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "HCM.Persons.Mcp",
    domain: "HCM",
    description: "Employee search, list all employees",
    baseUrl: "https://paycorhcmpersonsmcpncQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "HR.Assets.Mcp",
    domain: "HR",
    description: "Company asset assignments",
    baseUrl: "https://paycorHRAssetsmcpncQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "HR.Assignments.Mcp",
    domain: "HR",
    description: "Employee employment lifecycle",
    baseUrl: "https://paycorhrassignmentsmcpncQuarterly.azurewebsites.net",
    enabled: false,
  },
  {
    name: "HR.Certification.Mcp",
    domain: "HR",
    description: "Employee certifications and compliance",
    baseUrl: "https://PaycorCertificationMcpNCQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "HR.EmployeeTransfer.Mcp",
    domain: "HR",
    description: "Employee transfers between departments",
    baseUrl: "https://paycorhremployeetransfermcpncQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "HR.Onboarding.Mcp",
    domain: "HR",
    description: "New hire onboarding management",
    baseUrl: "https://paycorHRonboardingmcpncQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "Integrations.FileImport.Mcp",
    domain: "Integrations",
    description: "Bulk HR data imports via file",
    baseUrl:
      "https://paycorintegrationsfileimportmcpncQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "Payroll.Payruns.Mcp",
    domain: "Payroll",
    description: "Payroll runs and pay history",
    baseUrl: "https://paycorpayrollpayrunsmcpNCQuarterly.azurewebsites.net",
    enabled: true,
  },
  {
    name: "WFM.Time.Mcp",
    domain: "WFM",
    description: "Time and attendance: timecards and schedules",
    baseUrl: "https://paycorwfmtimemcpNCQuarterly.azurewebsites.net",
    enabled: true,
  },
];
