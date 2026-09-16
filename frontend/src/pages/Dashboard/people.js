// src/pages/Dashboard/people.js
//
// The two plain helpers the people pages share. Apart from PeopleFields.jsx
// because that file exports only components, which is what lets the dev
// server hot-reload it without a full page refresh.

/** Why the role select is fixed on this row, in the words that fit the case. */
export function whyRoleIsFixed(customer, isSelf) {
  if (isSelf) return 'Your own account';
  if (customer.is_superuser) return 'Superuser — managed in the Django admin';
  if (customer.is_erased) return 'Erased account';
  // The server only lets admins hand out roles.
  if (!customer.can_change_role) return 'Only an admin can change roles';
  return '';
}

/** "Voorbeeld Klant" becomes "VK". */
export function initialsOf(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
