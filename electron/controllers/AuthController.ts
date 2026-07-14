import { AuthService } from '../services/AuthService';

const service = new AuthService();

export const AuthController = {
    connecter: (identifiant: string, motDePasse: string) => service.connecter(identifiant, motDePasse),
};
