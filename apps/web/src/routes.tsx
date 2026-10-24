// Rotas dos módulos (carregadas sob demanda para dividir o bundle).
import { lazy, Suspense, type ReactNode } from "react";
import { Route } from "react-router-dom";
import { Spinner } from "./components/ui";

const page = (load: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(async () => ({ default: (await load())[name] as React.ComponentType }));

const AgendaPage = page(() => import("./pages/ops/AgendaPage"), "AgendaPage");
const MyAgendaPage = page(() => import("./pages/ops/MyAgendaPage"), "MyAgendaPage");
const ClientsPage = page(() => import("./pages/ops/ClientsPage"), "ClientsPage");
const ClientDetailPage = page(() => import("./pages/ops/ClientDetailPage"), "ClientDetailPage");
const DuplicatesPage = page(() => import("./pages/ops/DuplicatesPage"), "DuplicatesPage");
const ServicesPage = page(() => import("./pages/ops/CatalogPages"), "ServicesPage");
const ProfessionalsPage = page(() => import("./pages/ops/CatalogPages"), "ProfessionalsPage");
const SalesPage = page(() => import("./pages/ops/SalesPages"), "SalesPage");
const SaleDetailPage = page(() => import("./pages/ops/SalesPages"), "SaleDetailPage");
const StockPage = page(() => import("./pages/ops/StockPage"), "StockPage");
const ReportsPage = page(() => import("./pages/ops/ReportsPage"), "ReportsPage");
const ImportPage = page(() => import("./pages/ops/ImportPage"), "ImportPage");
const FinancePage = page(() => import("./pages/finance/FinancePage"), "FinancePage");
const CommissionsPage = page(() => import("./pages/finance/CommissionsPage"), "CommissionsPage");
const AccountPage = page(() => import("./pages/AccountPage"), "AccountPage");
const PeoplePage = page(() => import("./pages/admin/PeoplePage"), "PeoplePage");
const AccessProfilesPage = page(() => import("./pages/admin/AccessProfilesPage"), "AccessProfilesPage");
const AuditPage = page(() => import("./pages/admin/AuditPage"), "AuditPage");

const wrap = (el: ReactNode) => <Suspense fallback={<Spinner />}>{el}</Suspense>;

export const routes = [
  <Route key="conta" path="conta" element={wrap(<AccountPage />)} />,
  <Route key="pessoas" path="configuracoes/pessoas" element={wrap(<PeoplePage />)} />,
  <Route key="perfis" path="configuracoes/perfis" element={wrap(<AccessProfilesPage />)} />,
  <Route key="auditoria" path="auditoria" element={wrap(<AuditPage />)} />,
  <Route key="agenda" path="agenda" element={wrap(<AgendaPage />)} />,
  <Route key="minha-agenda" path="minha-agenda" element={wrap(<MyAgendaPage />)} />,
  <Route key="clientes" path="clientes" element={wrap(<ClientsPage />)} />,
  <Route key="duplicidades" path="clientes/duplicidades" element={wrap(<DuplicatesPage />)} />,
  <Route key="cliente" path="clientes/:id" element={wrap(<ClientDetailPage />)} />,
  <Route key="servicos" path="servicos" element={wrap(<ServicesPage />)} />,
  <Route key="profissionais" path="profissionais" element={wrap(<ProfessionalsPage />)} />,
  <Route key="comandas" path="comandas" element={wrap(<SalesPage />)} />,
  <Route key="comanda" path="comandas/:id" element={wrap(<SaleDetailPage />)} />,
  <Route key="estoque" path="estoque" element={wrap(<StockPage />)} />,
  <Route key="relatorios" path="relatorios" element={wrap(<ReportsPage />)} />,
  <Route key="importacao" path="importacao" element={wrap(<ImportPage />)} />,
  <Route key="financeiro" path="financeiro" element={wrap(<FinancePage />)} />,
  <Route key="comissoes" path="comissoes" element={wrap(<CommissionsPage />)} />,
];
