# Security Advisories

This document tracks known security vulnerabilities and their mitigation strategies.

## Active Vulnerabilities

### CVE-2025-56200: validator.js URL Validation Bypass

**Status**: ✅ RESOLVED - Migrated to Joi validation  
**Severity**: Moderate (CVSS 6.1)  
**Affected Package**: validator@<=13.15.15  
**Introduced via**: express-validator@7.2.1 → validator@13.12.0

#### Description
A URL validation bypass vulnerability exists in validator.js through version 13.15.15. The `isURL()` function uses '://' as a delimiter to parse protocols, while browsers use ':' as the delimiter. This parsing difference allows attackers to bypass protocol and domain validation by crafting URLs leading to XSS and Open Redirect attacks.

#### Impact Assessment
**Risk Level**: LOW
- ✅ Project does NOT use `isURL()` function directly
- ✅ Project does NOT use URL validation from validator.js
- ✅ All URL handling is done through custom validation logic
- ✅ No user-provided URLs are processed without sanitization

#### Resolution Actions Taken

1. **✅ Complete Migration**: 
   - Removed express-validator dependency entirely
   - Migrated all validation to Joi schemas
   - Updated all route handlers to use Joi validation
   - Eliminated validator.js transitive dependency

2. **Verification**:
   - ✅ Security audit shows no vulnerabilities: `pnpm audit`
   - ✅ No express-validator imports remain in codebase
   - ✅ All validation now uses secure Joi implementation

3. **Benefits of Migration**:
   - Eliminated security vulnerability completely
   - Improved validation performance with Joi
   - Better type safety with TypeScript
   - More maintainable validation schemas

#### Validation Functions Used
The project only uses these safe validation functions from express-validator:
- `isString()`, `isArray()`, `isInt()`, `isFloat()`, `isBoolean()`
- `isIn()`, `matches()`, `equals()`, `custom()`, `optional()`
- `isLength()`, `isObject()`

#### References
- [CVE-2025-56200](https://nvd.nist.gov/vuln/detail/CVE-2025-56200)
- [GitHub Advisory GHSA-9965-vmph-33xx](https://github.com/advisories/GHSA-9965-vmph-33xx)
- [validator.js Issue #2600](https://github.com/validatorjs/validator.js/issues/2600)

---

## Resolved Vulnerabilities

*No resolved vulnerabilities at this time.*

---

## Security Review Process

1. **Weekly Audits**: Run `pnpm audit` to check for new vulnerabilities
2. **Dependency Updates**: Review security implications before updating dependencies
3. **Code Review**: Ensure new code doesn't introduce vulnerable patterns
4. **Testing**: Validate that security mitigations remain effective

## Contact

For security concerns, please review this document and follow the project's security reporting guidelines.