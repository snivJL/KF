"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { massUpdateInvoices } from "@/app/invoices/actions";
import { CheckCircle, AlertCircle, XCircle, Loader2, Info } from "lucide-react";

interface UpdateResult {
  success: boolean;
  message: string;
  details: {
    itemsUpdated?: number;
    invoicesUpdated?: number;
    errorType?: "validation" | "zoho" | "database" | "network" | "unknown";
  };
}

export default function MassUpdateDialog({
  filters,
}: {
  filters: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("employeeCode");
  const [value, setValue] = useState("");
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasFilters = Object.values(filters).some((v) => v);

  const onSubmit = () => {
    if (!value.trim()) {
      setResult({
        success: false,
        message: "Please enter a value",
        details: { errorType: "validation" },
      });
      return;
    }

    setResult(null); // Clear any previous results

    startTransition(async () => {
      try {
        // Call the server action and expect it to return a result object
        const response = await massUpdateInvoices({ filters, field, value });

        // Handle successful response
        setResult({
          success: true,
          message: "Update completed successfully!",
          details: response?.details || {},
        });

        // Auto-close after success (with delay so user can see the success message)
        setTimeout(() => {
          setOpen(false);
          setResult(null);
          setValue("");
        }, 2000);
      } catch (error) {
        // Parse different types of errors
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";

        let errorType: UpdateResult["details"]["errorType"] = "unknown";
        let userMessage = errorMessage;

        // Categorize errors for better user experience
        if (
          errorMessage.includes("Employee with code") &&
          errorMessage.includes("not found")
        ) {
          errorType = "validation";
          userMessage = `Employee "${value}" was not found. Please check the employee code.`;
        } else if (errorMessage.includes("Zoho")) {
          errorType = "zoho";
          if (errorMessage.includes("authentication failed")) {
            userMessage =
              "Authentication with Zoho failed. Please contact your administrator.";
          } else if (errorMessage.includes("rate limit")) {
            userMessage =
              "Too many requests to Zoho. Please wait a moment and try again.";
          } else if (errorMessage.includes("server error")) {
            userMessage =
              "Zoho services are temporarily unavailable. Please try again later.";
          } else {
            userMessage =
              "Failed to sync with Zoho. Your changes were not saved.";
          }
        } else if (errorMessage.includes("timeout")) {
          errorType = "network";
          userMessage = "The operation took too long. Please try again.";
        } else if (
          errorMessage.includes("database") ||
          errorMessage.includes("transaction")
        ) {
          errorType = "database";
          userMessage = "Database error occurred. Please try again.";
        }

        setResult({
          success: false,
          message: userMessage,
          details: {
            errorType,
          },
        });

        console.error("Mass update failed:", error);
      }
    });
  };

  const getStatusIcon = () => {
    if (isPending)
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    if (!result) return null;

    if (result.success) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else {
      switch (result.details?.errorType) {
        case "validation":
          return <AlertCircle className="h-5 w-5 text-amber-500" />;
        case "zoho":
        case "network":
        case "database":
          return <XCircle className="h-5 w-5 text-red-500" />;
        default:
          return <XCircle className="h-5 w-5 text-red-500" />;
      }
    }
  };

  const getStatusColor = () => {
    if (isPending) return "text-blue-600 bg-blue-50 border-blue-200";
    if (!result) return "";

    if (result.success) {
      return "text-green-600 bg-green-50 border-green-200";
    } else {
      switch (result.details?.errorType) {
        case "validation":
          return "text-amber-600 bg-amber-50 border-amber-200";
        case "zoho":
        case "network":
        case "database":
          return "text-red-600 bg-red-50 border-red-200";
        default:
          return "text-red-600 bg-red-50 border-red-200";
      }
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setValue("");
  };

  const getFilterSummary = () => {
    const activeFilters = Object.entries(filters).filter(([_, value]) => value);
    if (activeFilters.length === 0) return "No filters applied";

    return activeFilters.map(([key, value]) => `${key}: ${value}`).join(", ");
  };

  return (
    <>
      <Button
        variant="outline"
        size="default"
        className="h-10 px-4 bg-transparent"
        disabled={!hasFilters}
        onClick={() => setOpen(true)}
      >
        Mass Update
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            {/* Header */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Mass Update Invoices</h3>
              <div className="mt-2 p-3 rounded-md bg-blue-50 border border-blue-200">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-700">
                    <p className="font-medium">Current filters:</p>
                    <p className="text-blue-600">{getFilterSummary()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mass-field">Field to Update</Label>
                <select
                  id="mass-field"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isPending}
                >
                  <option value="employeeCode">Employee Code</option>
                  {/* Add more options as you extend functionality */}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mass-value">New Value</Label>
                <Input
                  id="mass-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter employee code..."
                  disabled={isPending}
                  className="focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Status Display */}
            {(isPending || result) && (
              <div className={`mt-4 p-3 rounded-md border ${getStatusColor()}`}>
                <div className="flex items-start gap-3">
                  {getStatusIcon()}
                  <div className="flex-1">
                    {isPending ? (
                      <div>
                        <p className="font-medium">Updating invoices...</p>
                        <p className="text-sm opacity-75 mt-1">
                          This may take a moment while we sync with Zoho
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{result?.message}</p>
                        {result?.success && result?.details && (
                          <p className="text-sm opacity-75 mt-1">
                            {result.details.itemsUpdated &&
                              `${result.details.itemsUpdated} items updated`}
                            {result.details.invoicesUpdated &&
                              ` across ${result.details.invoicesUpdated} invoices`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-6">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
              >
                {result?.success ? "Close" : "Cancel"}
              </Button>

              {!result?.success && (
                <Button
                  onClick={onSubmit}
                  disabled={isPending || !value.trim()}
                  className="min-w-[100px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update"
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
