"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

export default function Filters(props: {
  q: string;
  dateFrom: string;
  dateTo: string;
  employeeCode: string;
  accountCode: string;
  productCode: string;
}) {
  const { q, dateFrom, dateTo, employeeCode, accountCode, productCode } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const [employee, setEmployee] = useState(employeeCode);
  const [account, setAccount] = useState(accountCode);
  const [product, setProduct] = useState(productCode);

  const apply = () => {
    startTransition(() => {
      const url = new URL(window.location.href);
      if (from) url.searchParams.set("dateFrom", from);
      else url.searchParams.delete("dateFrom");
      if (to) url.searchParams.set("dateTo", to);
      else url.searchParams.delete("dateTo");
      if (employee) url.searchParams.set("employeeCode", employee);
      else url.searchParams.delete("employeeCode");
      if (account) url.searchParams.set("accountCode", account);
      else url.searchParams.delete("accountCode");
      if (product) url.searchParams.set("productCode", product);
      else url.searchParams.delete("productCode");
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      url.searchParams.set("page", "1");
      router.push(url.toString());
    });
  };

  const clear = () => {
    setFrom("");
    setTo("");
    setEmployee("");
    setAccount("");
    setProduct("");
    startTransition(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("dateFrom");
      url.searchParams.delete("dateTo");
      url.searchParams.delete("employeeCode");
      url.searchParams.delete("accountCode");
      url.searchParams.delete("productCode");
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      url.searchParams.set("page", "1");
      router.push(url.toString());
    });
  };

  return (
    <div className="grid gap-2 md:grid-cols-7 items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="dateFrom">Date From</Label>
        <Input
          id="dateFrom"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dateTo">Date To</Label>
        <Input
          id="dateTo"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="employeeCode">Employee Code</Label>
        <Input
          id="employeeCode"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="accountCode">Account Code</Label>
        <Input
          id="accountCode"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="productCode">Product Code</Label>
        <Input
          id="productCode"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        />
      </div>
      <Button onClick={apply}>Apply</Button>
      <Button variant="outline" onClick={clear}>
        Clear
      </Button>
    </div>
  );
}
