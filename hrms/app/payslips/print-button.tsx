"use client";
import { Printer } from "lucide-react";
export function PrintPayslipButton() { return <button className="admin-button payslip-print" onClick={() => window.print()} type="button"><Printer size={16}/> 列印／存成 PDF</button>; }
