import React from 'react';
import './ui.css';

/**
 * Table Component
 * 
 * @param {Object} props
 * @param {boolean} props.responsive - Enable mobile card view
 * @param {string} props.className - Additional CSS classes
 */
export function Table({ responsive = false, className = '', children, ...props }) {
  const tableClass = responsive ? 'ui-table ui-table-responsive' : 'ui-table';
  
  return (
    <div className={`ui-table-container ${className}`}>
      <table className={tableClass} {...props}>
        {children}
      </table>
    </div>
  );
}

/**
 * Table Head Component
 */
export function TableHead({ className = '', children, ...props }) {
  return (
    <thead className={className} {...props}>
      {children}
    </thead>
  );
}

/**
 * Table Body Component
 */
export function TableBody({ className = '', children, ...props }) {
  return (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  );
}

/**
 * Table Row Component
 */
export function TableRow({ className = '', children, ...props }) {
  return (
    <tr className={className} {...props}>
      {children}
    </tr>
  );
}

/**
 * Table Header Cell Component
 */
export function TableHeaderCell({ className = '', children, ...props }) {
  return (
    <th className={className} {...props}>
      {children}
    </th>
  );
}

/**
 * Table Cell Component - with data-label for responsive view
 */
export function TableCell({ label, className = '', children, ...props }) {
  return (
    <td className={className} data-label={label} {...props}>
      {children}
    </td>
  );
}

export default Table;
