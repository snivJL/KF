'use client';

import { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { massUpdateInvoices } from '@/app/invoices/actions';
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Info,
  ChevronDown,
} from 'lucide-react';
import { getAllEmployees } from '@/lib/actions/employees';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { toast } from 'sonner';

interface UpdateResult {
  success: boolean;
  message: string;
  details: {
    itemsUpdated?: number;
    invoicesUpdated?: number;
    errorType?: 'validation' | 'zoho' | 'database' | 'network' | 'unknown';
  };
}

interface Employee {
  id: string;
  code: string;
  name?: string;
}

interface ActiveJob {
  jobId: string;
  progress: number;
  status: string;
  totalItems: number;
  processedItems: number;
}

export default function MassUpdateDialog({
  filters,
}: {
  filters: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState('employeeCode');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const hasFilters = Object.values(filters).some((v) => v);

  useEffect(() => {
    console.log(open, employees);
    if (open && employees.length === 0) {
      console.log('fetching');
      fetchEmployees();
    }
  }, [open]);

  useEffect(() => {
    if (!activeJob) return;

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/jobs/${activeJob.jobId}/progress`);
        const data = await response.json();

        if (data.progress) {
          setActiveJob({
            jobId: data.progress.jobId,
            progress: data.progress.progress,
            status: data.progress.status,
            totalItems: data.progress.totalItems,
            processedItems: data.progress.processedItems,
          });

          // Remove active job when completed
          if (
            ['COMPLETED', 'FAILED', 'CANCELLED'].includes(data.progress.status)
          ) {
            setTimeout(() => {
              setActiveJob(null);
              if (data.progress.status === 'COMPLETED') {
                toast('Mass update completed successfully!');
                // Refresh your invoice list here
                window.location.reload();
              } else if (data.progress.status === 'FAILED') {
                toast.error(
                  'Mass update failed. Please check the job details.',
                );
              }
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Failed to poll job progress:', error);
      }
    };

    const interval = setInterval(pollProgress, 2000);
    return () => clearInterval(interval);
  }, [activeJob]);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const employees = await getAllEmployees();
      console.log(employees);
      setEmployees(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const onSubmit = () => {
    if (!selectedEmployee) {
      setResult({
        success: false,
        message: 'Please select an employee',
        details: { errorType: 'validation' },
      });
      return;
    }

    setResult(null); // Clear any previous results

    startTransition(async () => {
      try {
        // Call the server action with the selected employee code
        const selectedEmployeeData = employees.find(
          (emp) => emp.id === selectedEmployee,
        );
        const employeeCode = selectedEmployeeData?.code || selectedEmployee;

        const response = await massUpdateInvoices({
          filters,
          field,
          value: employeeCode,
        });

        // Handle successful response
        setResult({
          success: true,
          message: 'Update completed successfully!',
          details: response?.details || {},
        });

        // Auto-close after success (with delay so user can see the success message)
        setTimeout(() => {
          setOpen(false);
          setResult(null);
          setSelectedEmployee('');
        }, 2000);
      } catch (error) {
        // Parse different types of errors
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred';

        let errorType: UpdateResult['details']['errorType'] = 'unknown';
        let userMessage = errorMessage;

        // Categorize errors for better user experience
        if (
          errorMessage.includes('Employee with code') &&
          errorMessage.includes('not found')
        ) {
          errorType = 'validation';
          userMessage =
            'Selected employee was not found. Please try selecting a different employee.';
        } else if (errorMessage.includes('Zoho')) {
          errorType = 'zoho';
          if (errorMessage.includes('authentication failed')) {
            userMessage =
              'Authentication with Zoho failed. Please contact your administrator.';
          } else if (errorMessage.includes('rate limit')) {
            userMessage =
              'Too many requests to Zoho. Please wait a moment and try again.';
          } else if (errorMessage.includes('server error')) {
            userMessage =
              'Zoho services are temporarily unavailable. Please try again later.';
          } else {
            userMessage =
              'Failed to sync with Zoho. Your changes were not saved.';
          }
        } else if (errorMessage.includes('timeout')) {
          errorType = 'network';
          userMessage = 'The operation took too long. Please try again.';
        } else if (
          errorMessage.includes('database') ||
          errorMessage.includes('transaction')
        ) {
          errorType = 'database';
          userMessage = 'Database error occurred. Please try again.';
        }

        setResult({
          success: false,
          message: userMessage,
          details: {
            errorType,
          },
        });

        console.error('Mass update failed:', error);
      }
    });
  };

  const startMassUpdate = async () => {
    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }

    try {
      const selectedEmployeeData = employees.find(
        (emp) => emp.id === selectedEmployee,
      );
      const employeeCode = selectedEmployeeData?.code || selectedEmployee;

      const response = await fetch('/api/jobs/start-mass-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          field,
          value: employeeCode.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        if (result.jobId) {
          setActiveJob({
            jobId: result.jobId,
            progress: 0,
            status: 'PENDING',
            totalItems: 0,
            processedItems: 0,
          });
          toast.info('Job started! You can monitor progress below.');
        } else {
          toast('success', result.message);
          setSelectedEmployee('');
        }
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Failed to start mass update:', error);
      toast.error('Failed to start mass update. Please try again.');
    }
  };

  const getStatusIcon = () => {
    if (isPending)
      return <Loader2 className="size-5 animate-spin text-blue-500" />;
    if (!result) return null;

    if (result.success) {
      return <CheckCircle className="size-5 text-green-500" />;
    } else {
      switch (result.details?.errorType) {
        case 'validation':
          return <AlertCircle className="size-5 text-amber-500" />;
        case 'zoho':
        case 'network':
        case 'database':
          return <XCircle className="size-5 text-red-500" />;
        default:
          return <XCircle className="size-5 text-red-500" />;
      }
    }
  };

  const getStatusColor = () => {
    if (isPending) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (!result) return '';

    if (result.success) {
      return 'text-green-600 bg-green-50 border-green-200';
    } else {
      switch (result.details?.errorType) {
        case 'validation':
          return 'text-amber-600 bg-amber-50 border-amber-200';
        case 'zoho':
        case 'network':
        case 'database':
          return 'text-red-600 bg-red-50 border-red-200';
        default:
          return 'text-red-600 bg-red-50 border-red-200';
      }
    }
  };

  const handleClose = () => {
    setOpen(false);
    setResult(null);
    setSelectedEmployee('');
  };

  const getFilterSummary = () => {
    const activeFilters = Object.entries(filters).filter(([_, value]) => value);
    if (activeFilters.length === 0) return 'No filters applied';

    return activeFilters.map(([key, value]) => `${key}: ${value}`).join(', ');
  };

  const getSelectedEmployeeDisplay = () => {
    const employee = employees.find((emp) => emp.id === selectedEmployee);
    if (!employee) return 'Select an employee...';
    return `${employee.code}${employee.name ? ` - ${employee.name}` : ''}`;
  };
  const employeeLabel = (emp?: Employee) =>
    emp ? `${emp.code}${emp.name ? ` - ${emp.name}` : ''}` : '';
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
                  <Info className="size-4 text-blue-500 mt-0.5 shrink-0" />
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
                <Select
                  value={field}
                  onValueChange={setField}
                  disabled={isPending}
                >
                  <SelectTrigger id="mass-field" className="w-full">
                    <SelectValue placeholder="Choose field…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employeeCode">
                      Employee Assignment
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employee-select">Select Employee</Label>
                <div className="relative">
                  <Select
                    value={selectedEmployee}
                    onValueChange={setSelectedEmployee}
                    disabled={isPending || loadingEmployees}
                  >
                    <SelectTrigger id="employee-select" className="w-full">
                      <SelectValue
                        placeholder={
                          loadingEmployees
                            ? 'Loading employees…'
                            : 'Select an employee…'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {employeeLabel(emp)}
                        </SelectItem>
                      ))}
                      {employees.length === 0 && !loadingEmployees && (
                        <div className="px-3 py-2 text-sm text-amber-600">
                          No employees found. Please check your database.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
                </div>

                {employees.length === 0 && !loadingEmployees && (
                  <p className="text-sm text-amber-600">
                    No employees found. Please check your database.
                  </p>
                )}
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
                          Assigning items to{' '}
                          {getSelectedEmployeeDisplay().split(' - ')[0]} and
                          syncing with Zoho
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
                {result?.success ? 'Close' : 'Cancel'}
              </Button>

              {!result?.success && (
                <Button
                  onClick={startMassUpdate}
                  disabled={isPending || !selectedEmployee || loadingEmployees}
                  className="min-w-[100px]"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update'
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
