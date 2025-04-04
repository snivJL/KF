import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductsTab } from "@/components/sync/products-tab";
import { EmployeesTab } from "@/components/sync/employees-tab";
import AccountsTab from "@/components/sync/accounts-tab";

export default function SyncDataPage() {
  return (
    <div className="pb-6 max-w-7xl mx-auto">
      <Tabs defaultValue="products" className="flex flex-col">
        {/* Sticky Header inside Tabs */}
        <div className="sticky top-0 z-30 bg-background shadow-b-sm ">
          <div className="p-6 pb-4">
            <h1 className="text-2xl font-semibold">🔄 Sync Data from VCRM</h1>
          </div>

          <div className="px-6">
            <TabsList className="w-full">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="employees">Employees</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Scrollable Content inside Tabs */}
        <div className="flex-1 px-6">
          <TabsContent value="products">
            <ProductsTab />
          </TabsContent>

          <TabsContent value="employees">
            <EmployeesTab />
          </TabsContent>

          <TabsContent value="accounts">
            <AccountsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
