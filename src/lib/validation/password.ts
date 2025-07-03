import { z } from 'zod';

// Dynamic password constraints configuration
export interface PasswordConstraints {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  forbiddenPatterns: string[];
}

// Default password constraints
export const DEFAULT_PASSWORD_CONSTRAINTS: PasswordConstraints = {
  minLength: 8,
  maxLength: 64,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  forbiddenPatterns: ['password', '123456', 'qwerty', 'admin']
};

// Validation error messages
export const PASSWORD_ERROR_MESSAGES = {
  minLength: (min: number) => `Password must be at least ${min} characters long`,
  maxLength: (max: number) => `Password must be at most ${max} characters long`,
  requireUppercase: 'Password must contain at least one uppercase letter',
  requireLowercase: 'Password must contain at least one lowercase letter',
  requireNumbers: 'Password must contain at least one number',
  requireSpecialChars: 'Password must contain at least one special character (!@#$%^&*)',
  forbiddenPattern: (pattern: string) => `Password cannot contain '${pattern}'`,
  common: 'Password is too common or weak'
};

// Create dynamic password schema based on constraints
export function createPasswordSchema(constraints: PasswordConstraints = DEFAULT_PASSWORD_CONSTRAINTS) {
  let schema = z.string()
    .min(constraints.minLength, PASSWORD_ERROR_MESSAGES.minLength(constraints.minLength))
    .max(constraints.maxLength, PASSWORD_ERROR_MESSAGES.maxLength(constraints.maxLength));

  // Add character type requirements
  if (constraints.requireUppercase) {
    schema = schema.regex(/[A-Z]/, PASSWORD_ERROR_MESSAGES.requireUppercase);
  }

  if (constraints.requireLowercase) {
    schema = schema.regex(/[a-z]/, PASSWORD_ERROR_MESSAGES.requireLowercase);
  }

  if (constraints.requireNumbers) {
    schema = schema.regex(/\d/, PASSWORD_ERROR_MESSAGES.requireNumbers);
  }

  if (constraints.requireSpecialChars) {
    schema = schema.regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, PASSWORD_ERROR_MESSAGES.requireSpecialChars);
  }

  // Add forbidden patterns check
  if (constraints.forbiddenPatterns.length > 0) {
    return schema.refine(
      (password) => {
        const lowerPassword = password.toLowerCase();
        return !constraints.forbiddenPatterns.some(pattern => 
          lowerPassword.includes(pattern.toLowerCase())
        );
      },
      {
        message: PASSWORD_ERROR_MESSAGES.common
      }
    );
  }

  return schema;
}

// Login validation schema
export const loginSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and dashes'),
  password: z.string().min(1, 'Password is required')
});

// Registration validation schema (using dynamic password validation)
export function createRegistrationSchema(constraints: PasswordConstraints = DEFAULT_PASSWORD_CONSTRAINTS) {
  return z.object({
    suUsername: z.string()
      .min(3, 'Username must be at least 3 characters')
      .max(32, 'Username must be at most 32 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and dashes'),
    suPassword: createPasswordSchema(constraints),
    suConfirmPassword: z.string(),
    captchaAnswer: z.string().min(1, 'Please answer the PDR question'),
    turnstileToken: z.string().optional()
  }).refine(
    (data) => data.suPassword === data.suConfirmPassword,
    {
      message: 'Passwords do not match',
      path: ['suConfirmPassword']
    }
  );
}

// Utility function to validate password strength and return detailed feedback
export function validatePasswordStrength(password: string, constraints: PasswordConstraints = DEFAULT_PASSWORD_CONSTRAINTS) {
  const errors: string[] = [];
  const requirements: { met: boolean; message: string }[] = [];

  // Length checks
  if (password.length < constraints.minLength) {
    errors.push(PASSWORD_ERROR_MESSAGES.minLength(constraints.minLength));
  }
  requirements.push({
    met: password.length >= constraints.minLength,
    message: `At least ${constraints.minLength} characters`
  });

  if (password.length > constraints.maxLength) {
    errors.push(PASSWORD_ERROR_MESSAGES.maxLength(constraints.maxLength));
  }

  // Character type checks
  if (constraints.requireUppercase) {
    const hasUppercase = /[A-Z]/.test(password);
    if (!hasUppercase) errors.push(PASSWORD_ERROR_MESSAGES.requireUppercase);
    requirements.push({
      met: hasUppercase,
      message: 'At least one uppercase letter'
    });
  }

  if (constraints.requireLowercase) {
    const hasLowercase = /[a-z]/.test(password);
    if (!hasLowercase) errors.push(PASSWORD_ERROR_MESSAGES.requireLowercase);
    requirements.push({
      met: hasLowercase,
      message: 'At least one lowercase letter'
    });
  }

  if (constraints.requireNumbers) {
    const hasNumbers = /\d/.test(password);
    if (!hasNumbers) errors.push(PASSWORD_ERROR_MESSAGES.requireNumbers);
    requirements.push({
      met: hasNumbers,
      message: 'At least one number'
    });
  }

  if (constraints.requireSpecialChars) {
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasSpecialChars) errors.push(PASSWORD_ERROR_MESSAGES.requireSpecialChars);
    requirements.push({
      met: hasSpecialChars,
      message: 'At least one special character'
    });
  }

  // Forbidden patterns check
  if (constraints.forbiddenPatterns.length > 0) {
    const lowerPassword = password.toLowerCase();
    const hasForbiddenPattern = constraints.forbiddenPatterns.some(pattern => 
      lowerPassword.includes(pattern.toLowerCase())
    );
    if (hasForbiddenPattern) {
      errors.push(PASSWORD_ERROR_MESSAGES.common);
    }
    requirements.push({
      met: !hasForbiddenPattern,
      message: 'Not a common or weak password'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    requirements,
    strength: calculatePasswordStrength(password, requirements)
  };
}

// Calculate password strength score (0-100)
function calculatePasswordStrength(password: string, requirements: { met: boolean; message: string }[]): number {
  const metRequirements = requirements.filter(req => req.met).length;
  const totalRequirements = requirements.length;
  
  if (totalRequirements === 0) return 0;
  
  let baseScore = (metRequirements / totalRequirements) * 80;
  
  // Bonus points for length beyond minimum
  if (password.length > 12) baseScore += 10;
  if (password.length > 16) baseScore += 10;
  
  return Math.min(100, Math.round(baseScore));
}