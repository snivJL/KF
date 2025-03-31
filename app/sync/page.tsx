import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductsTab } from "@/components/sync/products-tab";
import { EmployeesTab } from "@/components/sync/employees-tab";
import AccountsTab from "@/components/sync/accounts-tab";

export default function SyncDataPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">🔄 Sync Data from VCRM</h1>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductsTab />
        </TabsContent>

        <TabsContent value="employees">
          <EmployeesTab />
        </TabsContent>

        <TabsContent value="accounts">
          <AccountsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
