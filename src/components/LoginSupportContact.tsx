export const LOGIN_SUPPORT_PHONE = '800-330-5993';
export const LOGIN_SUPPORT_PHONE_TEL = '8003305993';

type LoginSupportContactProps = {
  className?: string;
};

export function LoginSupportContact({ className = 'text-center text-sm text-muted-foreground' }: LoginSupportContactProps) {
  return (
    <p className={className}>
      Any issues logging in, contact Connections at{' '}
      <a href={`tel:${LOGIN_SUPPORT_PHONE_TEL}`} className="text-primary hover:underline font-medium">
        {LOGIN_SUPPORT_PHONE}
      </a>
      .
    </p>
  );
}
