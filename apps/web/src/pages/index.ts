import type { Request, Response } from "express";

const en = {
  title: "HMCTS Express Monorepo Template",
  subtitle: "Production-ready Node.js starter with cloud-native capabilities",
  intro:
    "A comprehensive monorepo template that demonstrates best practices for building HMCTS digital services using Express.js, TypeScript, and GOV.UK Design System.",

  cloudNativeTitle: "Cloud Native Platform",
  cloudNativeDescription: "Features for cloud deployment and operations:",
  cloudNativeFeatures: [
    {
      name: "Health Checks",
      description: "Configurable health endpoints with readiness and liveness probes for Kubernetes deployments"
    },
    {
      name: "Azure Integration",
      description: "Built-in support for Azure Key Vault secrets management and properties volume mounting"
    },
    {
      name: "Application Insights",
      description: "Comprehensive monitoring with Azure Application Insights including custom metrics and distributed tracing"
    },
    {
      name: "Properties Volume",
      description: "Secure configuration management through mounted volumes with automatic environment variable injection"
    }
  ],

  govukStarterTitle: "GOV.UK Starter",
  govukStarterDescription: "Everything you need to build GDS services:",
  govukStarterFeatures: [
    {
      name: "GOV.UK Design System",
      description: "Fully integrated GOV.UK Frontend with Nunjucks templates and automatic asset compilation"
    },
    {
      name: "Internationalization",
      description: "Welsh language support with locale middleware and translation management system"
    },
    {
      name: "Security Headers",
      description: "Pre-configured Helmet.js with CSP, HSTS, and nonce-based script protection"
    },
    {
      name: "Simple Router",
      description: "File-based routing with automatic route discovery and HTTP method handlers"
    },
    {
      name: "Asset Pipeline",
      description: "Vite-powered asset compilation with SCSS support and production optimization"
    }
  ],

  architectureTitle: "Monorepo Architecture",
  architectureDescription: "Organized for scalability and maintainability:",
  architectureFeatures: [
    "Workspace-based structure with Yarn workspaces",
    "Shared libraries for common functionality",
    "TypeScript with strict mode and ES modules",
    "Comprehensive testing with Vitest and Playwright",
    "Docker multi-stage builds for production",
    "Helm charts for Kubernetes deployment",
    "GitHub Actions CI/CD pipeline",
    "Biome for fast linting and formatting"
  ],

  gettingStartedTitle: "Getting Started",
  gettingStartedSteps: [
    { text: "Install dependencies with", code: "yarn install" },
    { text: "Run development server with", code: "yarn dev" },
    { text: "Access the application at", code: "http://localhost:3000" }
  ],

  learnMoreTitle: "Learn More",
  learnMoreDescription: "Explore the codebase and documentation to understand the full capabilities of this template."
};

const cy = {
  title: "Templed Monorepo Express HMCTS",
  subtitle: "Dechreuwr Node.js barod i gynhyrchu gyda galluoedd cwmwl-gynhenid",
  intro:
    "Templed monorepo cynhwysfawr sy'n dangos arferion gorau ar gyfer adeiladu gwasanaethau digidol HMCTS gan ddefnyddio Express.js, TypeScript, a System Dylunio GOV.UK.",

  cloudNativeTitle: "Platfform Cwmwl Cynhenid",
  cloudNativeDescription: "Nodweddion ar gyfer defnyddio a gweithrediadau cwmwl:",
  cloudNativeFeatures: [
    {
      name: "Gwiriadau Iechyd",
      description: "Pwyntiau terfyn iechyd y gellir eu ffurfweddu gyda phrofion parodrwydd a bywiogrwydd ar gyfer defnyddiadau Kubernetes"
    },
    {
      name: "Integreiddiad Azure",
      description: "Cefnogaeth adeiledig ar gyfer rheoli cyfrinachau Azure Key Vault a gosod cyfrol eiddo"
    },
    {
      name: "Application Insights",
      description: "Monitro cynhwysfawr gydag Azure Application Insights gan gynnwys metrigau wedi'u haddasu ac olrhain dosbarthedig"
    },
    {
      name: "Cyfrol Eiddo",
      description: "Rheoli ffurfweddiad diogel trwy gyfrolau wedi'u gosod gyda chwistrellu newidyn amgylchedd awtomatig"
    }
  ],

  govukStarterTitle: "Dechreuwr GOV.UK",
  govukStarterDescription: "Popeth sydd ei angen arnoch i adeiladu gwasanaethau GDS hygyrch:",
  govukStarterFeatures: [
    {
      name: "System Dylunio GOV.UK",
      description: "Blaen GOV.UK wedi'i integreiddio'n llawn gyda thempledi Nunjucks a chrynhoad ased awtomatig"
    },
    {
      name: "Rhyngwladoli",
      description: "Cefnogaeth iaith Gymraeg gyda cyfryngwr locale a system rheoli cyfieithu"
    },
    {
      name: "Penawdau Diogelwch",
      description: "Helmet.js wedi'i ffurfweddu ymlaen llaw gyda CSP, HSTS, ac amddiffyniad sgript seiliedig ar nonce"
    },
    {
      name: "Llwybrydd Syml",
      description: "Llwybro seiliedig ar ffeiliau gyda darganfod llwybrau awtomatig a trinwyr dull HTTP"
    },
    {
      name: "Piblinell Asedau",
      description: "Crynhoad ased wedi'i bweru gan Vite gyda chefnogaeth SCSS ac optimeiddio cynhyrchu"
    }
  ],

  architectureTitle: "Pensaernïaeth Monorepo",
  architectureDescription: "Wedi'i drefnu ar gyfer graddadwyedd a chynhaliwyd:",
  architectureFeatures: [
    "Strwythur seiliedig ar weithle gyda gweithle Yarn",
    "Llyfrgelloedd a rennir ar gyfer ymarferoldeb cyffredin",
    "TypeScript gyda modd llym a modiwlau ES",
    "Profi cynhwysfawr gyda Vitest a Playwright",
    "Adeiladau aml-gam Docker ar gyfer cynhyrchu",
    "Siartiau Helm ar gyfer defnyddio Kubernetes",
    "Piblinell CI/CD GitHub Actions",
    "Biome ar gyfer lintio a fformatio cyflym"
  ],

  gettingStartedTitle: "Dechrau Arni",
  gettingStartedSteps: [
    { text: "Gosod dibyniaethau gyda", code: "yarn install" },
    { text: "Rhedeg gweinydd datblygu gyda", code: "yarn dev" },
    { text: "Cyrchu'r cais yn", code: "http://localhost:3000" }
  ],

  learnMoreTitle: "Dysgu Mwy",
  learnMoreDescription: "Archwiliwch y sylfaen cod a'r dogfennaeth i ddeall galluoedd llawn y templed hwn."
};

export const GET = async (_req: Request, res: Response) => {
  res.render("index", { en, cy });
};
