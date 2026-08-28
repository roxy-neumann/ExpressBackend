Parameters:
#1 - path to the project
#2 - folder of the service inside the project directory
#3 - name of dotenv defined in the service
#4 - any string indicates that should be run under nodemon process
#5 - any string indicates that should be swagger re-generated

E.g.:
Run "BE-episodes" service that located in "D:\dev\_Projects\AnyPodcast\" in "dev" env profile:
    run_server.bat D:\dev\_Projects\AnyPodcast\ BE-episodes dev
Run "BE-episodes" service that located in "D:\dev\_Projects\AnyPodcast\" in "dev" env profile running under "nodemon" and with swagger re-generation:
    run_server.bat D:\dev\_Projects\AnyPodcast\ BE-episodes dev nodemon swagger